import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useCurrentUser } from '@/auth/auth-context';
import { getChallengePosts } from '@/features/posts/service';
import { queryKeys } from '@/lib/queryKeys';

import {
  fetchActiveRideChallenge,
  fetchChallengeCatalog,
  fetchRideChallenge,
  fetchRideChallengeHistory,
  openRideChallenge,
} from './api';
import type { OpenRideChallengeInput, RideChallenge } from './types';

export function useActiveRideChallenge(rideId?: string | null) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.activeRideChallenge(rideId ?? 'missing'),
    queryFn: () => fetchActiveRideChallenge(rideId ?? ''),
    enabled: Boolean(rideId && user?.id),
    refetchInterval: 60_000,
  });
}

/** Active challenges for the given rides (only those the user has not completed). */
export function useActiveRideChallenges(rideIds: string[]) {
  const { user } = useCurrentUser();
  const rideIdsKey = [...new Set(rideIds.filter(Boolean))].sort().join(',');
  const uniqueIds = useMemo(
    () => (rideIdsKey ? rideIdsKey.split(',') : []),
    [rideIdsKey],
  );
  const queries = useQueries({
    queries: uniqueIds.map((rideId) => ({
      queryKey: queryKeys.activeRideChallenge(rideId),
      queryFn: () => fetchActiveRideChallenge(rideId),
      enabled: Boolean(rideId && user?.id),
      refetchInterval: 60_000,
    })),
  });

  const dataKey = queries
    .map((query) =>
      query.data
        ? `${query.data.id}:${query.data.current_user_completed ? '1' : '0'}`
        : query.isPending
          ? 'pending'
          : 'none',
    )
    .join('|');

  const byRideId = useMemo(() => {
    const map = new Map<string, RideChallenge>();
    uniqueIds.forEach((rideId, index) => {
      const challenge = queries[index]?.data;
      if (challenge && !challenge.current_user_completed) {
        map.set(rideId, challenge);
      }
    });
    return map;
    // queries array identity changes; dataKey captures meaningful updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, uniqueIds]);

  const eligible = useMemo(() => [...byRideId.values()], [byRideId]);

  return {
    byRideId,
    eligible,
    isPending: queries.some((query) => query.isPending),
  };
}

export function useRideChallengeHistory(rideId?: string | null) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.rideChallengeHistory(rideId ?? 'missing'),
    queryFn: () => fetchRideChallengeHistory(rideId ?? ''),
    enabled: Boolean(rideId && user?.id),
  });
}

export function useRideChallenge(rideChallengeId?: string | null) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.rideChallenge(rideChallengeId ?? 'missing'),
    queryFn: () => fetchRideChallenge(rideChallengeId ?? ''),
    enabled: Boolean(rideChallengeId && user?.id),
  });
}

export function useChallengePosts(rideChallengeId?: string | null) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.challengePosts(rideChallengeId ?? 'missing'),
    queryFn: () => getChallengePosts(rideChallengeId ?? ''),
    enabled: Boolean(rideChallengeId && user?.id),
  });
}

export function useChallengeCatalog(enabled = true) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.challengeCatalog(),
    queryFn: fetchChallengeCatalog,
    enabled: Boolean(enabled && user?.id),
  });
}

export function useOpenRideChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenRideChallengeInput) => openRideChallenge(input),
    onSuccess: (challenge) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.activeRideChallenge(challenge.ride_id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.rideChallengeHistory(challenge.ride_id),
      });
      void queryClient.setQueryData(queryKeys.rideChallenge(challenge.id), challenge);
    },
  });
}
