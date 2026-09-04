import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { purgeExpiredTemporaryPosts } from '@/features/posts/service';
import { fetchRideSchedule, fetchUserRides } from '@/features/rides/api';
import { SELECTED_RIDE_STORAGE_PREFIX } from '@/features/rides/selection';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { DATE_FORMAT, getWeekRange } from '@/utils/schedule';
import { format } from 'date-fns';

import { isSoloRideNotificationData, type NotificationRide, type PostedRideDate } from './planner';
import { getNotificationsEnabled } from './preferences';
import { queueCommentDeepLink } from './deep-link';
import {
  isJoinRequestDecisionNotificationData,
  isJoinRequestNotificationData,
  isRideChallengeNotificationData,
  isSocialNotificationData,
  registerExpoPushToken,
  unregisterExpoPushToken,
  type SocialNotificationData,
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
  if (
    isSocialNotificationData(data) ||
    isSoloRideNotificationData(data) ||
    isJoinRequestNotificationData(data) ||
    isJoinRequestDecisionNotificationData(data) ||
    isRideChallengeNotificationData(data)
  ) {
    return data.rideId;
  }
  if (data && typeof data === 'object') {
    const rideId = (data as Record<string, unknown>).rideId;
    if (typeof rideId === 'string' && rideId.length > 0) return rideId;
  }
  return undefined;
}

function persistSelectedRide(userId: string | undefined, rideId: string) {
  if (!userId) return;
  void AsyncStorage.setItem(SELECTED_RIDE_STORAGE_PREFIX + userId, rideId);
}

/** Drop stale home/feed caches so the ride opened from a tap shows fresh data. */
function invalidateQueriesForNotification(queryClient: QueryClient, data: unknown) {
  void queryClient.invalidateQueries({ queryKey: ['rides'] });
  void queryClient.invalidateQueries({ queryKey: ['rides-due-today'] });
  void queryClient.invalidateQueries({ queryKey: ['camera-rides'] });
  void queryClient.invalidateQueries({ queryKey: ['my-pending-join-requests'] });

  const rideId = rideIdFromNotificationData(data);
  if (rideId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ridePosts(rideId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.ride(rideId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.rideMembers(rideId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.rideJoinRequests(rideId) });
    void queryClient.invalidateQueries({ queryKey: ['ride-schedule', rideId] });
    void queryClient.invalidateQueries({ queryKey: ['posted-status', rideId] });
    void queryClient.invalidateQueries({ queryKey: ['week-posted-status', rideId] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activeRideChallenge(rideId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.rideChallengeHistory(rideId) });
  }

  if (isRideChallengeNotificationData(data)) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.rideChallenge(data.rideChallengeId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.challengePosts(data.rideChallengeId),
    });
  }

  if (isSocialNotificationData(data)) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.post(data.postId) });
    if (data.kind === 'social_comment' || data.kind === 'social_mention') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(data.postId) });
    }
  } else {
    const social = parseSocialNotificationData(data);
    if (social) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.post(social.postId) });
      if (social.kind === 'social_comment' || social.kind === 'social_mention') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.comments(social.postId) });
      }
    }
  }
}

function openHome(rideId?: string) {
  try {
    if (rideId) {
      // notificationOpenId forces Home to re-apply selectRide even when the
      // same rideId is already in the URL (e.g. user switched rides manually).
      router.replace({
        pathname: '/',
        params: {
          selectRideId: rideId,
          notificationOpenId: String(Date.now()),
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

function openRideSettingsPeople(rideId: string) {
  try {
    // Land on Home first so the settings back button has a screen to return to
    // (cold-start / push-only stacks otherwise leave nowhere to go).
    router.replace({
      pathname: '/',
      params: {
        selectRideId: rideId,
        notificationOpenId: String(Date.now()),
      },
    });
    router.push({
      pathname: '/ride/[rideId]/settings',
      params: { rideId, tab: 'people' },
    });
  } catch {
    openHome(rideId);
  }
}

function openChallengeFromNotification(rideId: string, rideChallengeId: string) {
  try {
    router.replace({
      pathname: '/',
      params: {
        selectRideId: rideId,
        notificationOpenId: String(Date.now()),
      },
    });
    router.push({
      pathname: '/ride/[rideId]/challenge/[rideChallengeId]',
      params: { rideId, rideChallengeId },
    });
  } catch {
    openHome(rideId);
  }
}

/** Flatten Expo / OS notification payloads into the custom `data` object. */
function notificationData(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const record = raw as Record<string, unknown>;
  if (record.kind != null || record.rideId != null || record.postId != null) {
    return raw;
  }
  if (record.data && typeof record.data === 'object') return record.data;
  if (typeof record.body === 'string') {
    try {
      const parsed = JSON.parse(record.body) as unknown;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // ignore
    }
  }
  return raw;
}

/** Coerce Expo push `data` fields (sometimes non-strings) into SocialNotificationData. */
function parseSocialNotificationData(value: unknown): SocialNotificationData | null {
  const payload = notificationData(value);
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  const kind = String(data.kind ?? '');
  const rideId = String(data.rideId ?? '');
  const postId = String(data.postId ?? '');
  if (
    kind !== 'social_post' &&
    kind !== 'social_comment' &&
    kind !== 'social_mention'
  ) {
    return null;
  }
  if (!rideId || !postId) return null;
  const commentId =
    data.commentId == null || data.commentId === ''
      ? undefined
      : String(data.commentId);
  const isTemporary =
    typeof data.isTemporary === 'boolean'
      ? data.isTemporary
      : data.isTemporary === 'true'
        ? true
        : data.isTemporary === 'false'
          ? false
          : undefined;
  return { kind, rideId, postId, commentId, isTemporary };
}

/** Open the matching Ride when possible; otherwise land on home. */
function openFromNotificationData(
  queryClient: QueryClient,
  data: unknown,
  userId?: string,
) {
  const payload = notificationData(data);
  invalidateQueriesForNotification(queryClient, payload);

  if (isJoinRequestNotificationData(payload)) {
    persistSelectedRide(userId, payload.rideId);
    openRideSettingsPeople(payload.rideId);
    return;
  }

  if (isJoinRequestDecisionNotificationData(payload)) {
    if (payload.status === 'accepted') {
      persistSelectedRide(userId, payload.rideId);
      openHome(payload.rideId);
    } else {
      openHome();
    }
    return;
  }

  if (isRideChallengeNotificationData(payload)) {
    persistSelectedRide(userId, payload.rideId);
    openChallengeFromNotification(payload.rideId, payload.rideChallengeId);
    return;
  }

  const social = parseSocialNotificationData(payload);
  if (social) {
    persistSelectedRide(userId, social.rideId);
    if (social.kind === 'social_comment' || social.kind === 'social_mention') {
      // In-memory queue — Native Tabs often drop search params on `/`.
      queueCommentDeepLink({ rideId: social.rideId, postId: social.postId });
    }
    openHome(social.rideId);
    return;
  }

  const rideId = rideIdFromNotificationData(payload);
  if (rideId) {
    persistSelectedRide(userId, rideId);
    openHome(rideId);
    return;
  }

  openHome();
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
    scheduleKind: ride.schedule_kind,
    monthDay: ride.month_day,
    weekdayOrdinal: ride.weekday_ordinal,
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
        openFromNotificationData(
          queryClient,
          response.notification.request.content.data,
          user?.id,
        );
      } catch {
        openHome();
      }
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);

    void Notifications.getLastNotificationResponseAsync().then(handleResponse);

    return () => responseSub.remove();
  }, [queryClient, user?.id]);

  return null;
}
