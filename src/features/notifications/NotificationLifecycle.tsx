import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { fetchRideSchedule, fetchUserRides } from '@/features/rides/api';
import { supabase } from '@/lib/supabase';
import { DATE_FORMAT, getWeekRange } from '@/utils/schedule';
import { format } from 'date-fns';

import type { NotificationRide, PostedRideDate } from './planner';
import { getNotificationsEnabled } from './preferences';
import {
  isSocialNotificationData,
  registerExpoPushToken,
  unregisterExpoPushToken,
} from './push';
import {
  cancelSoloRideNotifications,
  getSoloRideNotificationPermission,
  reconcileSoloRideNotifications,
} from './service';

const refreshListeners = new Set<() => void>();

export function requestNotificationRefresh() {
  refreshListeners.forEach((listener) => listener());
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function openFromNotificationData(data: unknown) {
  if (!isSocialNotificationData(data)) return;
  router.replace({
    pathname: '/',
    params: { selectRideId: data.rideId },
  });
}

async function loadNotificationPlan(userId: string) {
  const userRides = await fetchUserRides(userId);
  const activeRides = userRides.filter((ride) => !ride.is_archived);
  const schedules = await Promise.all(
    activeRides.map(async (ride) => ({
      ride,
      weekdays: (await fetchRideSchedule(ride.id)).map((day) => day.weekday),
    })),
  );
  const today = format(new Date(), DATE_FORMAT);
  const currentWeek = getWeekRange();
  const { data: posts, error } = await supabase
    .from('posts')
    .select('ride_id,scheduled_date')
    .eq('user_id', userId)
    .gte('scheduled_date', currentWeek.start)
    .lte('scheduled_date', today);

  if (error) throw error;

  const rides: NotificationRide[] = schedules.map(({ ride, weekdays }) => ({
    id: ride.id,
    name: ride.name,
    startDate: ride.start_date,
    endDate: ride.end_date,
    notificationTime: ride.notification_time,
    weekdays,
    strictSchedule: ride.strict_schedule,
    archived: ride.is_archived,
  }));
  const postedRideDates: PostedRideDate[] = (posts ?? []).map((post) => ({
    rideId: String(post.ride_id),
    scheduledDate: String(post.scheduled_date),
  }));

  return { rides, postedRideDates };
}

export function NotificationLifecycle() {
  const { user } = useAuth();
  const previousUserId = useRef<string | null>(null);
  const reconciling = useRef(false);
  const pendingReconcile = useRef(false);

  const reconcile = useCallback(async () => {
    if (!user) return;
    // Permission prompts and AppState can fire while a pass is in flight;
    // queue a follow-up instead of dropping the refresh that runs after grant.
    if (reconciling.current) {
      pendingReconcile.current = true;
      return;
    }

    reconciling.current = true;
    try {
      do {
        pendingReconcile.current = false;
        const userId = user.id;
        const enabled = await getNotificationsEnabled(userId);
        if (!enabled) {
          await cancelSoloRideNotifications({ userId });
          await unregisterExpoPushToken();
          continue;
        }

        // Push token sync is independent of local reminder scheduling so a
        // rides/posts fetch failure cannot leave push_tokens empty.
        try {
          const permission = await getSoloRideNotificationPermission();
          if (permission === 'granted') {
            await registerExpoPushToken(userId);
          } else {
            await unregisterExpoPushToken();
          }
        } catch {
          // Token sync is best effort.
        }

        try {
          const plan = await loadNotificationPlan(userId);
          await reconcileSoloRideNotifications({ userId, ...plan });
        } catch {
          // Local reminder scheduling is best effort.
        }
      } while (pendingReconcile.current);
    } finally {
      reconciling.current = false;
      if (pendingReconcile.current) {
        void reconcile();
      }
    }
  }, [user]);

  useEffect(() => {
    const priorUserId = previousUserId.current;
    if (priorUserId && priorUserId !== user?.id) {
      void cancelSoloRideNotifications({ userId: priorUserId });
      void unregisterExpoPushToken();
    }
    previousUserId.current = user?.id ?? null;

    void Notifications.setBadgeCountAsync(0).catch(() => undefined);
    void reconcile();
  }, [reconcile, user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void Notifications.setBadgeCountAsync(0).catch(() => undefined);
        void reconcile();
      }
    });
    const listener = () => void reconcile();
    refreshListeners.add(listener);
    return () => {
      subscription.remove();
      refreshListeners.delete(listener);
    };
  }, [reconcile]);

  useEffect(() => {
    const lastHandledResponseId = { current: null as string | null };

    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const responseId = response.notification.request.identifier;
      if (lastHandledResponseId.current === responseId) return;
      lastHandledResponseId.current = responseId;
      openFromNotificationData(response.notification.request.content.data);
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);

    void Notifications.getLastNotificationResponseAsync().then(handleResponse);

    return () => responseSub.remove();
  }, []);

  return null;
}
