import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { groupUserRides } from './grouping';
import type { UserRide } from './types';

const STORAGE_KEY_PREFIX = 'soloride:last-ride-id:';

function pickDefaultRide(rides: readonly UserRide[]): UserRide | null {
  const groups = groupUserRides(rides);
  return groups.active[0] ?? groups.upcoming[0] ?? groups.archived[0] ?? null;
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
    void AsyncStorage.getItem(STORAGE_KEY_PREFIX + userId).then((stored) => {
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
      setSelectedRideId(pickDefaultRide(rides)?.id ?? null);
    }
  }, [isHydrated, rides, selectedRideId]);

  const selectRide = useCallback(
    (rideId: string) => {
      setSelectedRideId(rideId);
      if (userId) void AsyncStorage.setItem(STORAGE_KEY_PREFIX + userId, rideId);
    },
    [userId],
  );

  return {
    selectedRideId,
    selectRide,
    isReady: isHydrated,
  };
}
