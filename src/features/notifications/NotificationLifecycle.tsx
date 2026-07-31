import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { purgeExpiredTemporaryPosts } from '@/features/posts/service';
import { fetchRideSchedule, fetchUserRides } from '@/features/rides/api';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { DATE_FORMAT, getWeekRange } from '@/utils/schedule';
import { format } from 'date-fns';

import { isSoloRideNotificationData, type NotificationRide, type PostedRideDate } from './planner';
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

function rideIdFromNotificationData(data: unknown): string | undefined {
  if (isSocialNotificationData(data) || isSoloRideNotificationData(data)) {
    return data.rideId;
  }
  if (data && typeof data === 'object') {
    const rideId = (data as Record<string, unknown>).rideId;
    if (typeof rideId === 'string' && rideId.length > 0) return rideId;
  }
  return undefined;
}

/** Drop stale home/feed caches so the ride opened from a tap shows fresh data. */
function invalidateQueriesForNotification(queryClient: QueryClient, data: unknown) {
  void queryClient.invalidateQueries({ queryKey: ['rides'] });
  void queryClient.invalidateQueries({ queryKey: ['rides-due-today'] });
  void queryClient.invalidateQueries({ queryKey: ['camera-rides'] });

  const rideId = rideIdFromNotificationData(data);
  if (rideId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ridePosts(rideId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.ride(rideId) });
    void queryClient.invalidateQueries({ queryKey: ['ride-schedule', rideId] });
    void queryClient.invalidateQueries({ queryKey: ['posted-status', rideId] });
    void queryClient.invalidateQueries({ queryKey: ['week-posted-status', rideId] });
  }

  if (isSocialNotificationData(data)) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.post(data.postId) });
    if (data.kind === 'social_comment' || data.kind === 'social_mention') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(data.postId) });
    }
  }
}

function openHome(rideId?: string, openCommentsPostId?: string) {
  try {
    if (rideId) {
      // notificationOpenId forces Home to re-apply selectRide even when the
      // same rideId is already in the URL (e.g. user switched rides manually).
      router.replace({
        pathname: '/',
        params: {
          selectRideId: rideId,
          notificationOpenId: String(Date.now()),
          ...(openCommentsPostId ? { openCommentsPostId } : {}),
        },
      });
      return;
    }
    router.replace('/');
  } catch {
    // Last-resort navigation if replace with params fails.
    try {
      router.replace('/');
    } catch {
      // Ignore — the app is already open.
    }
  }
}

/** Open the matching Ride when possible; otherwise land on home. */
function openFromNotificationData(queryClient: QueryClient, data: unknown) {
  invalidateQueriesForNotification(queryClient, data);
  const rideId = rideIdFromNotificationData(data);
  const openCommentsPostId =
    isSocialNotificationData(data) &&
    (data.kind === 'social_comment' || data.kind === 'social_mention')
      ? data.postId
      : undefined;
  openHome(rideId, openCommentsPostId);
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
  const queryClient = useQueryClient();
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
          await purgeExpiredTemporaryPosts();
        } catch {
          // Expired temp cleanup is best effort.
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
      try {
        openFromNotificationData(queryClient, response.notification.request.content.data);
      } catch {
        openHome();
      }
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);

    void Notifications.getLastNotificationResponseAsync().then(handleResponse);

    return () => responseSub.remove();
  }, [queryClient]);

  return null;
}
