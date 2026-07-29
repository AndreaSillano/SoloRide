import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/auth/auth-context';
import { queryKeys } from '@/lib/queryKeys';
import {
  getNextScheduledDate,
  getScheduledDateForPost,
  getWeekRange,
} from '@/utils/schedule';

import {
  archiveRide,
  createRide,
  deleteRide,
  fetchPostedTodayStatus,
  fetchRide,
  fetchRideMembers,
  fetchRideSchedule,
  fetchWeekPostStatus,
  fetchUserRides,
  joinRideByCode,
  leaveRide,
  previewRideByCode,
  unarchiveRide,
  updateRide,
} from './api';

export const rideQueryKeys = {
  schedule: (rideId: string) => ['ride-schedule', rideId] as const,
};

function useInvalidateRideQueries(userId?: string | null) {
  const queryClient = useQueryClient();

  return async (rideId?: string) => {
    const invalidations: Promise<void>[] = [
      queryClient.invalidateQueries({ queryKey: ['rides'] }),
      queryClient.invalidateQueries({ queryKey: ['rides-due-today'] }),
    ];

    if (userId) {
      invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.rides(userId) }));
    }
    if (rideId) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.ride(rideId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.rideMembers(rideId) }),
        queryClient.invalidateQueries({ queryKey: rideQueryKeys.schedule(rideId) }),
        queryClient.invalidateQueries({ queryKey: ['posted-status', rideId] }),
      );
    }

    await Promise.all(invalidations);
  };
}

export function useUserRides(userId?: string | null) {
  return useQuery({
    queryKey: queryKeys.rides(userId ?? 'signed-out'),
    queryFn: () => fetchUserRides(userId ?? ''),
    enabled: Boolean(userId),
  });
}

export function useRide(rideId?: string | null) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.ride(rideId ?? 'missing'),
    queryFn: () => fetchRide(rideId ?? ''),
    enabled: Boolean(rideId && user?.id),
  });
}

export function useRideMembers(rideId?: string | null) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.rideMembers(rideId ?? 'missing'),
    queryFn: () => fetchRideMembers(rideId ?? ''),
    enabled: Boolean(rideId && user?.id),
  });
}

export function useRideSchedule(rideId?: string | null) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: rideQueryKeys.schedule(rideId ?? 'missing'),
    queryFn: () => fetchRideSchedule(rideId ?? ''),
    enabled: Boolean(rideId && user?.id),
  });
}

export function usePostedTodayStatus(
  rideId?: string | null,
  userId?: string | null,
  scheduledDate?: string | null,
) {
  return useQuery({
    queryKey: queryKeys.postedStatus(
      rideId ?? 'missing',
      userId ?? 'signed-out',
      scheduledDate ?? 'not-scheduled',
    ),
    queryFn: () =>
      fetchPostedTodayStatus(rideId ?? '', userId ?? '', scheduledDate ?? ''),
    enabled: Boolean(rideId && userId && scheduledDate),
  });
}

export function useWeekPostStatus(
  rideId?: string | null,
  userId?: string | null,
  weekStart?: string | null,
  weekEnd?: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.weekPostedStatus(
      rideId ?? 'missing',
      userId ?? 'signed-out',
      weekStart ?? 'missing',
      weekEnd ?? 'missing',
    ),
    queryFn: () =>
      fetchWeekPostStatus(rideId ?? '', userId ?? '', weekStart ?? '', weekEnd ?? ''),
    enabled: Boolean(enabled && rideId && userId && weekStart && weekEnd),
  });
}

/**
 * Consolidates a Ride's schedule with today's posting status so screens don't
 * duplicate the "is today a photo day, and did I already post" calculation.
 */
export function usePostingStatus(rideId?: string | null, userId?: string | null) {
  const ride = useRide(rideId);
  const schedule = useRideSchedule(rideId);
  const weekdays = schedule.data?.map((day) => day.weekday) ?? [];
  const rideWindow = ride.data
    ? { startDate: ride.data.start_date, endDate: ride.data.end_date, weekdays }
    : null;
  const scheduledToday = rideWindow ? getScheduledDateForPost(rideWindow) : null;
  const posted = usePostedTodayStatus(rideId, userId, scheduledToday);
  const nextDate = rideWindow && schedule.data ? getNextScheduledDate(rideWindow) : null;
  const isArchived = Boolean(ride.data?.is_archived);
  const strictSchedule = ride.data?.strict_schedule ?? true;
  const week = getWeekRange();
  const weeklyPosted = useWeekPostStatus(
    rideId,
    userId,
    week.start,
    week.end,
    Boolean(ride.data && !strictSchedule),
  );
  const weekSatisfied = !strictSchedule && Boolean(weeklyPosted.data?.hasPosted);

  return {
    isPending: ride.isPending || schedule.isPending || (!strictSchedule && weeklyPosted.isPending),
    isArchived,
    scheduledToday,
    nextDate,
    canPost: Boolean(scheduledToday && !isArchived && !posted.data?.hasPosted),
    hasPosted: Boolean(posted.data?.hasPosted),
    postId: posted.data?.postId ?? null,
    isRequiredToday: Boolean(scheduledToday && (strictSchedule || !weekSatisfied)),
    weekSatisfied,
  };
}

export function usePreviewRideByCode() {
  return useMutation({ mutationFn: previewRideByCode });
}

export function useCreateRide(userId?: string | null) {
  const invalidate = useInvalidateRideQueries(userId);
  return useMutation({
    mutationFn: createRide,
    onSuccess: (ride) => invalidate(ride.id),
  });
}

export function useUpdateRide(userId?: string | null) {
  const invalidate = useInvalidateRideQueries(userId);
  return useMutation({
    mutationFn: updateRide,
    onSuccess: (ride) => invalidate(ride.id),
  });
}

export function useJoinRideByCode(userId?: string | null) {
  const invalidate = useInvalidateRideQueries(userId);
  return useMutation({
    mutationFn: joinRideByCode,
    onSuccess: (ride) => invalidate(ride.id),
  });
}

export function useLeaveRide(userId?: string | null) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateRideQueries(userId);

  return useMutation({
    mutationFn: leaveRide,
    onSuccess: async (_result, rideId) => {
      await invalidate(rideId);
      queryClient.removeQueries({ queryKey: queryKeys.ride(rideId) });
      queryClient.removeQueries({ queryKey: queryKeys.rideMembers(rideId) });
      queryClient.removeQueries({ queryKey: rideQueryKeys.schedule(rideId) });
    },
  });
}

export function useDeleteRide(userId?: string | null) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateRideQueries(userId);

  return useMutation({
    mutationFn: deleteRide,
    onSuccess: async (_result, rideId) => {
      await invalidate(rideId);
      queryClient.removeQueries({ queryKey: queryKeys.ride(rideId) });
      queryClient.removeQueries({ queryKey: queryKeys.rideMembers(rideId) });
      queryClient.removeQueries({ queryKey: rideQueryKeys.schedule(rideId) });
    },
  });
}

export function useArchiveRide(userId?: string | null) {
  const invalidate = useInvalidateRideQueries(userId);
  return useMutation({
    mutationFn: archiveRide,
    onSuccess: (ride) => invalidate(ride.id),
  });
}

export function useUnarchiveRide(userId?: string | null) {
  const invalidate = useInvalidateRideQueries(userId);
  return useMutation({
    mutationFn: unarchiveRide,
    onSuccess: (ride) => invalidate(ride.id),
  });
}
