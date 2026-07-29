import { useCallback, useMemo } from 'react';

import type { PlanNotificationsInput } from './planner';
import {
  cancelCurrentDayReminderAfterPost,
  cancelSoloRideNotifications,
  getSoloRideNotificationPermission,
  reconcileSoloRideNotifications,
  requestSoloRideNotificationPermission,
} from './service';

export type SoloRideReconcileInput = Omit<PlanNotificationsInput, 'userId'>;

export function useSoloRideNotifications(userId: string | null) {
  const reconcile = useCallback(
    (input: SoloRideReconcileInput, requestPermission = false) => {
      if (!userId) {
        return Promise.resolve({
          permission: 'undetermined' as const,
          scheduled: [],
          canceled: [],
          kept: [],
          errors: [],
        });
      }
      return reconcileSoloRideNotifications(
        { ...input, userId },
        { requestPermission },
      );
    },
    [userId],
  );

  const cancelRide = useCallback(
    (rideId: string) =>
      userId
        ? cancelSoloRideNotifications({ userId, rideId })
        : Promise.resolve([]),
    [userId],
  );

  const postCreated = useCallback(
    (rideId: string, scheduledDate: string) =>
      userId
        ? cancelCurrentDayReminderAfterPost(userId, rideId, scheduledDate)
        : Promise.resolve([]),
    [userId],
  );

  return useMemo(
    () => ({
      getPermission: getSoloRideNotificationPermission,
      requestPermission: requestSoloRideNotificationPermission,
      reconcile,
      onAppOpenedOrForegrounded: reconcile,
      onSessionRestored: reconcile,
      onRidesChanged: reconcile,
      onRideLeftOrArchived: cancelRide,
      onPostCreated: postCreated,
    }),
    [cancelRide, postCreated, reconcile],
  );
}
