import { Camera } from 'expo-camera';
import * as Location from 'expo-location';

import {
  requestNotificationRefresh,
  requestSoloRideNotificationPermission,
} from '@/features/notifications';

export type AppPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

function mapLocationStatus(
  status: Location.PermissionStatus | undefined,
): AppPermissionStatus {
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  if (status === Location.PermissionStatus.UNDETERMINED) return 'undetermined';
  return 'unavailable';
}

/** Current foreground location permission without prompting. */
export async function getForegroundLocationPermission(): Promise<{
  status: AppPermissionStatus;
  canAskAgain: boolean;
}> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    return {
      status: mapLocationStatus(current.status),
      canAskAgain: current.canAskAgain !== false,
    };
  } catch {
    return { status: 'unavailable', canAskAgain: false };
  }
}

/** Prompt for foreground location when allowed. */
export async function requestForegroundLocationPermission(): Promise<{
  status: AppPermissionStatus;
  canAskAgain: boolean;
}> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === Location.PermissionStatus.GRANTED) {
      return { status: 'granted', canAskAgain: true };
    }
    if (current.canAskAgain === false) {
      return { status: 'denied', canAskAgain: false };
    }
    const next = await Location.requestForegroundPermissionsAsync();
    return {
      status: mapLocationStatus(next.status),
      canAskAgain: next.canAskAgain !== false,
    };
  } catch {
    return { status: 'unavailable', canAskAgain: false };
  }
}

/**
 * Ask for camera, location, and notifications in sequence after auth.
 * Failures are swallowed so a denied prompt never blocks sign-in.
 */
export async function requestCoreAppPermissions() {
  await Camera.requestCameraPermissionsAsync().catch(() => undefined);
  await requestForegroundLocationPermission().catch(() => undefined);
  await requestSoloRideNotificationPermission().catch(() => undefined);
  requestNotificationRefresh();
}
