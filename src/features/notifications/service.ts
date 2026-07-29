import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  type ExistingManagedNotification,
  isSoloRideNotificationData,
  MAX_SOLO_RIDE_NOTIFICATIONS,
  planNotificationReconciliation,
  planSoloRideNotifications,
  type PlanNotificationsInput,
  type SoloRideNotificationData,
} from './planner';

export const SOLO_RIDE_CHANNEL_ID = 'solo-ride-schedule';

export type SoloRidePermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unavailable';

export type ReconcileNotificationsResult = {
  permission: SoloRidePermissionStatus;
  scheduled: string[];
  canceled: string[];
  kept: string[];
  errors: string[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function interpretPermission(
  permission: Notifications.NotificationPermissionsStatus,
): SoloRidePermissionStatus {
  const iosStatus = permission.ios?.status;
  if (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  if (iosStatus === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
  if (permission.granted) return 'granted';
  if (permission.status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

function triggerTimestamp(trigger: Notifications.NotificationTrigger): number | null {
  if (!trigger || typeof trigger !== 'object') return null;
  const raw = trigger as unknown as {
    type?: string;
    date?: Date | number;
    timestamp?: number;
  };
  if (raw.type !== 'date') return null;
  if (typeof raw.timestamp === 'number') return raw.timestamp;
  if (typeof raw.date === 'number') return raw.date;
  if (raw.date instanceof Date) return raw.date.getTime();
  return null;
}

function managedNotification(
  request: Notifications.NotificationRequest,
): ExistingManagedNotification | null {
  if (!isSoloRideNotificationData(request.content.data)) return null;
  return {
    identifier: request.identifier,
    data: request.content.data,
    triggerAt: triggerTimestamp(request.trigger),
  };
}

function managedNotifications(
  scheduled: readonly Notifications.NotificationRequest[],
): ExistingManagedNotification[] {
  return scheduled
    .map(managedNotification)
    .filter((item): item is ExistingManagedNotification => item !== null);
}

async function listManagedNotifications(): Promise<ExistingManagedNotification[]> {
  return managedNotifications(
    await Notifications.getAllScheduledNotificationsAsync(),
  );
}

export async function ensureSoloRideAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(SOLO_RIDE_CHANNEL_ID, {
    name: 'SoloRide',
    description: 'Ride reminders, new photos, and comments',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function getSoloRideNotificationPermission(): Promise<SoloRidePermissionStatus> {
  try {
    await ensureSoloRideAndroidChannel();
    return interpretPermission(await Notifications.getPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

export async function requestSoloRideNotificationPermission(): Promise<SoloRidePermissionStatus> {
  try {
    await ensureSoloRideAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    const currentStatus = interpretPermission(current);
    if (currentStatus === 'granted' || currentStatus === 'denied') return currentStatus;
    if (!current.canAskAgain) return 'denied';

    return interpretPermission(
      await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowSound: true,
        },
      }),
    );
  } catch {
    return 'unavailable';
  }
}

export async function reconcileSoloRideNotifications(
  input: PlanNotificationsInput,
  options: { requestPermission?: boolean } = {},
): Promise<ReconcileNotificationsResult> {
  const errors: string[] = [];
  const permission = options.requestPermission
    ? await requestSoloRideNotificationPermission()
    : await getSoloRideNotificationPermission();

  let allScheduled: Notifications.NotificationRequest[];
  try {
    allScheduled = await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    return {
      permission,
      scheduled: [],
      canceled: [],
      kept: [],
      errors: [errorMessage(error)],
    };
  }

  const existing = managedNotifications(allScheduled);
  const desired =
    permission === 'granted' ? planSoloRideNotifications(input) : [];
  const reconciliation = planNotificationReconciliation(desired, existing);
  const canceled: string[] = [];
  const scheduled: string[] = [];

  for (const identifier of reconciliation.cancelIdentifiers) {
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
      canceled.push(identifier);
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }

  if (permission === 'granted') {
    const remainingScheduledCount = allScheduled.length - canceled.length;
    const availableSlots = Math.max(
      0,
      MAX_SOLO_RIDE_NOTIFICATIONS - remainingScheduledCount,
    );
    for (const plan of reconciliation.schedule.slice(0, availableSlots)) {
      try {
        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: plan.title,
            body: plan.body,
            sound: 'default',
            data: plan.data,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: plan.triggerAt,
            channelId: Platform.OS === 'android' ? SOLO_RIDE_CHANNEL_ID : undefined,
          },
        });
        scheduled.push(identifier);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
  }

  return {
    permission,
    scheduled,
    canceled,
    kept: reconciliation.keepIdentifiers,
    errors,
  };
}

export async function cancelSoloRideNotifications(filters: {
  userId?: string;
  rideId?: string;
  kind?: SoloRideNotificationData['kind'];
  scheduledDate?: string;
}): Promise<string[]> {
  const existing = await listManagedNotifications();
  const matches = existing.filter(({ data }) => {
    if (filters.userId !== undefined && data.userId !== filters.userId) return false;
    if (filters.rideId !== undefined && data.rideId !== filters.rideId) return false;
    if (filters.kind !== undefined && data.kind !== filters.kind) return false;
    return (
      filters.scheduledDate === undefined ||
      data.scheduledDate === filters.scheduledDate
    );
  });

  const canceled: string[] = [];
  for (const notification of matches) {
    await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    canceled.push(notification.identifier);
  }
  return canceled;
}

export async function cancelCurrentDayReminderAfterPost(
  userId: string,
  rideId: string,
  scheduledDate: string,
): Promise<string[]> {
  return cancelSoloRideNotifications({
    userId,
    rideId,
    kind: 'reminder',
    scheduledDate,
  });
}
