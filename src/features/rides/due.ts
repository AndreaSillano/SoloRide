import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { supabase } from '@/lib/supabase';
import { DATE_FORMAT, getScheduledDateForPost, getWeekRange } from '@/utils/schedule';

import { fetchRideSchedule, fetchUserRides } from './api';
import type { UserRide } from './types';

export type DueTodayRide = UserRide & {
  scheduledToday: string;
  /** True when posting today still satisfies a required slot (strict day or
   * unsatisfied flexible week). False means an optional/bonus post. */
  isRequiredToday: boolean;
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
    const scheduledToday = getScheduledDateForPost({
      startDate: ride.start_date,
      endDate: ride.end_date,
      weekdays,
    });
    if (!scheduledToday) continue;
    if (postedToday.has(ride.id)) continue;

    const strictSchedule = ride.strict_schedule ?? true;
    const weekSatisfied = !strictSchedule && weekSatisfiedRides.has(ride.id);
    const isRequiredToday = strictSchedule || !weekSatisfied;
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
