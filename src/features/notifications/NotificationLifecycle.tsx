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
  reconcileSoloRideNotifications,
} from './service';

const refreshListeners = new Set<() => void>();

export function requestNotificationRefresh() {
  refreshListeners.forEach((listener) => listener());
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
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

  const reconcile = useCallback(async () => {
    if (!user || reconciling.current) return;
    reconciling.current = true;
    try {
      const enabled = await getNotificationsEnabled(user.id);
      if (!enabled) {
        await cancelSoloRideNotifications({ userId: user.id });
        await unregisterExpoPushToken();
        return;
      }

      const plan = await loadNotificationPlan(user.id);
      const result = await reconcileSoloRideNotifications({ userId: user.id, ...plan });
      if (result.permission === 'granted') {
        await registerExpoPushToken(user.id);
      } else {
        await unregisterExpoPushToken();
      }
    } catch {
      // Foreground refresh is best effort; screen queries expose actionable errors.
    } finally {
      reconciling.current = false;
    }
  }, [user]);

  useEffect(() => {
    const priorUserId = previousUserId.current;
    if (priorUserId && priorUserId !== user?.id) {
      void cancelSoloRideNotifications({ userId: priorUserId });
      void unregisterExpoPushToken();
    }
    previousUserId.current = user?.id ?? null;

    void reconcile();
  }, [reconcile, user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile();
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
