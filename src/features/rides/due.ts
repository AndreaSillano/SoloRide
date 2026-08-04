import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { supabase } from '@/lib/supabase';
import {
  DATE_FORMAT,
  getScheduledDateForPost,
  getWeekRange,
  isRideActive,
  usesFlexibleWeek,
} from '@/utils/schedule';

import { fetchRideSchedule, fetchUserRides } from './api';
import { rideToWindow } from './schedule-window';
import type { UserRide } from './types';

export const MAX_ACTIVE_TEMPORARY_POSTS = 3;

export type DueTodayRide = UserRide & {
  scheduledToday: string;
  /** True when posting today still satisfies a required slot (strict day or
   * unsatisfied flexible week). False means an optional/bonus post. */
  isRequiredToday: boolean;
};

export type CameraRide = UserRide & {
  /** Local YYYY-MM-DD when today is a scheduled ride day; otherwise null. */
  scheduledToday: string | null;
  /** Local calendar date used for any post created today (permanent or temp). */
  postDate: string;
  canPublishPermanent: boolean;
  isRequiredToday: boolean;
  activeTemporaryCount: number;
  temporaryRemaining: number;
};

async function loadRidesDueToday(userId: string): Promise<{
  postableRides: DueTodayRide[];
  needsRequiredPhoto: boolean;
}> {
  const rides = (await fetchUserRides(userId)).filter((ride) => !ride.is_archived);
  if (!rides.length) {
    return { postableRides: [], needsRequiredPhoto: false };
  }

  const schedules = await Promise.all(
    rides.map(async (ride) => ({
      rideId: ride.id,
      weekdays: (await fetchRideSchedule(ride.id)).map((day) => day.weekday),
    })),
  );
  const weekdaysByRide = new Map(schedules.map((entry) => [entry.rideId, entry.weekdays]));

  const today = format(new Date(), DATE_FORMAT);
  const week = getWeekRange();
  const { data: posts, error } = await supabase
    .from('posts')
    .select('ride_id,scheduled_date')
    .eq('user_id', userId)
    .eq('is_temporary', false)
    .gte('scheduled_date', week.start)
    .lte('scheduled_date', today);

  if (error) throw error;

  const postedToday = new Set(
    (posts ?? [])
      .filter((post) => String(post.scheduled_date) === today)
      .map((post) => String(post.ride_id)),
  );
  const weekSatisfiedRides = new Set(
    (posts ?? []).map((post) => String(post.ride_id)),
  );

  const postableRides: DueTodayRide[] = [];
  let needsRequiredPhoto = false;

  for (const ride of rides) {
    const weekdays = weekdaysByRide.get(ride.id) ?? [];
    const scheduledToday = getScheduledDateForPost(rideToWindow(ride, weekdays));
    if (!scheduledToday) continue;
    if (postedToday.has(ride.id)) continue;

    const flexibleWeek = usesFlexibleWeek({
      scheduleKind: ride.schedule_kind,
      strictSchedule: ride.strict_schedule,
    });
    const weekSatisfied = flexibleWeek && weekSatisfiedRides.has(ride.id);
    const isRequiredToday = !flexibleWeek || !weekSatisfied;
    if (isRequiredToday) needsRequiredPhoto = true;

    postableRides.push({
      ...ride,
      scheduledToday,
      isRequiredToday,
    });
  }

  return { postableRides, needsRequiredPhoto };
}

/** Batches schedule + posting lookups so the Camera tab and badge stay cheap. */
export function useRidesDueToday(userId?: string | null) {
  return useQuery({
    queryKey: ['rides-due-today', userId ?? 'signed-out'] as const,
    queryFn: () => loadRidesDueToday(userId ?? ''),
    enabled: Boolean(userId),
  });
}

async function loadCameraRides(userId: string): Promise<CameraRide[]> {
  const rides = (await fetchUserRides(userId)).filter((ride) =>
    isRideActive(ride.start_date, ride.end_date, ride.is_archived),
  );
  if (!rides.length) return [];

  const schedules = await Promise.all(
    rides.map(async (ride) => ({
      rideId: ride.id,
      weekdays: (await fetchRideSchedule(ride.id)).map((day) => day.weekday),
    })),
  );
  const weekdaysByRide = new Map(schedules.map((entry) => [entry.rideId, entry.weekdays]));

  const today = format(new Date(), DATE_FORMAT);
  const week = getWeekRange();
  const nowIso = new Date().toISOString();

  const [{ data: permanentPosts, error: permanentError }, { data: tempPosts, error: tempError }] =
    await Promise.all([
      supabase
        .from('posts')
        .select('ride_id,scheduled_date')
        .eq('user_id', userId)
        .eq('is_temporary', false)
        .gte('scheduled_date', week.start)
        .lte('scheduled_date', today),
      supabase
        .from('posts')
        .select('ride_id')
        .eq('user_id', userId)
        .eq('is_temporary', true)
        .gt('expires_at', nowIso)
        .in(
          'ride_id',
          rides.map((ride) => ride.id),
        ),
    ]);

  if (permanentError) throw permanentError;
  if (tempError) throw tempError;

  const postedPermanentToday = new Set(
    (permanentPosts ?? [])
      .filter((post) => String(post.scheduled_date) === today)
      .map((post) => String(post.ride_id)),
  );
  const weekSatisfiedRides = new Set(
    (permanentPosts ?? []).map((post) => String(post.ride_id)),
  );
  const activeTempCounts = new Map<string, number>();
  for (const post of tempPosts ?? []) {
    const rideId = String(post.ride_id);
    activeTempCounts.set(rideId, (activeTempCounts.get(rideId) ?? 0) + 1);
  }

  return rides.map((ride) => {
    const weekdays = weekdaysByRide.get(ride.id) ?? [];
    const rideWindow = rideToWindow(ride, weekdays);
    const scheduledToday = getScheduledDateForPost(rideWindow);
    const canPublishPermanent = Boolean(
      scheduledToday && !postedPermanentToday.has(ride.id),
    );
    const flexibleWeek = usesFlexibleWeek(rideWindow);
    const weekSatisfied = flexibleWeek && weekSatisfiedRides.has(ride.id);
    const isRequiredToday = Boolean(scheduledToday && (!flexibleWeek || !weekSatisfied));
    const activeTemporaryCount = activeTempCounts.get(ride.id) ?? 0;

    return {
      ...ride,
      scheduledToday,
      postDate: today,
      canPublishPermanent,
      isRequiredToday,
      activeTemporaryCount,
      temporaryRemaining: Math.max(0, MAX_ACTIVE_TEMPORARY_POSTS - activeTemporaryCount),
    };
  });
}

/** Active rides plus permanent/temporary posting eligibility for the Camera tab. */
export function useCameraRides(userId?: string | null) {
  return useQuery({
    queryKey: ['camera-rides', userId ?? 'signed-out'] as const,
    queryFn: () => loadCameraRides(userId ?? ''),
    enabled: Boolean(userId),
  });
}
