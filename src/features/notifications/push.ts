import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import {
  ensureSoloRideAndroidChannel,
  getSoloRideNotificationPermission,
} from './service';

export type SocialNotificationData = {
  kind: 'social_post' | 'social_comment' | 'social_mention';
  rideId: string;
  postId: string;
  commentId?: string;
  isTemporary?: boolean;
};

export type JoinRequestNotificationData = {
  kind: 'join_request';
  rideId: string;
  requestId: string;
};

export type JoinRequestDecisionNotificationData = {
  kind: 'join_request_decision';
  rideId: string;
  requestId: string;
  status: 'accepted' | 'rejected';
};

export type JoinNotificationData =
  | JoinRequestNotificationData
  | JoinRequestDecisionNotificationData;

function pushProjectId(): string | null {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    null
  );
}

function platformLabel(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

export function isSocialNotificationData(value: unknown): value is SocialNotificationData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    (data.kind === 'social_post' ||
      data.kind === 'social_comment' ||
      data.kind === 'social_mention') &&
    typeof data.rideId === 'string' &&
    typeof data.postId === 'string'
  );
}

export function isJoinRequestNotificationData(
  value: unknown,
): value is JoinRequestNotificationData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    data.kind === 'join_request' &&
    typeof data.rideId === 'string' &&
    typeof data.requestId === 'string'
  );
}

export function isJoinRequestDecisionNotificationData(
  value: unknown,
): value is JoinRequestDecisionNotificationData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    data.kind === 'join_request_decision' &&
    typeof data.rideId === 'string' &&
    typeof data.requestId === 'string' &&
    (data.status === 'accepted' || data.status === 'rejected')
  );
}

export function isJoinNotificationData(value: unknown): value is JoinNotificationData {
  return isJoinRequestNotificationData(value) || isJoinRequestDecisionNotificationData(value);
}

export async function registerExpoPushToken(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const permission = await getSoloRideNotificationPermission();
  if (permission !== 'granted') return null;

  const projectId = pushProjectId();
  if (!projectId) return null;

  await ensureSoloRideAndroidChannel();

  // APNs can briefly fail right after a fresh permission grant; retry a few times.
  let token: string | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      break;
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  if (!token) return null;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: platformLabel(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );

  if (error) return null;
  return token;
}

export async function unregisterExpoPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  const projectId = pushProjectId();
  if (!projectId) return;

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // Best effort on logout / permission loss.
  }
}
