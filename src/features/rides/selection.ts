import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { groupUserRides } from './grouping';
import type { UserRide } from './types';

export const SELECTED_RIDE_STORAGE_PREFIX = 'soloride:last-ride-id:';

function pickDefaultRide(rides: readonly UserRide[]): UserRide | null {
  const groups = groupUserRides(rides);
  return groups.active[0] ?? groups.upcoming[0] ?? groups.archived[0] ?? null;
}

export async function getPersistedSelectedRideId(
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  return AsyncStorage.getItem(SELECTED_RIDE_STORAGE_PREFIX + userId);
}

/**
 * Last Home-selected Ride id from disk. Refreshes when `userId` changes;
 * call `refresh` on screen focus so Camera/Publish stay in sync with Home.
 */
export function usePersistedSelectedRideId(userId: string | null | undefined) {
  const [rideId, setRideId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!userId) {
      setRideId(null);
      return;
    }
    void getPersistedSelectedRideId(userId).then(setRideId);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { selectedRideId: rideId, refresh };
}

/**
 * Tracks which Ride the merged Home tab is currently showing, restoring the
 * last-viewed Ride per account from disk and falling back to the most
 * relevant Ride (active, then upcoming, then archived) when the stored id is
 * missing or no longer belongs to the user.
 */
export function useSelectedRide(
  rides: readonly UserRide[] | undefined,
  userId: string | null | undefined,
) {
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(false);
    setSelectedRideId(null);
    if (!userId) return;

    let cancelled = false;
    void getPersistedSelectedRideId(userId).then((stored) => {
      if (cancelled) return;
      setSelectedRideId(stored);
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!isHydrated || !rides) return;
    const stillExists = selectedRideId
      ? rides.some((ride) => ride.id === selectedRideId)
      : false;
    if (!stillExists) {
      const fallback = pickDefaultRide(rides);
      setSelectedRideId(fallback?.id ?? null);
      if (fallback && userId) {
        void AsyncStorage.setItem(SELECTED_RIDE_STORAGE_PREFIX + userId, fallback.id);
      }
    }
  }, [isHydrated, rides, selectedRideId, userId]);

  const selectRide = useCallback(
    (rideId: string) => {
      setSelectedRideId(rideId);
      if (userId) void AsyncStorage.setItem(SELECTED_RIDE_STORAGE_PREFIX + userId, rideId);
    },
    [userId],
  );

  return {
    selectedRideId,
    selectRide,
    isReady: isHydrated,
  };
}
