/**
 * Amplitude product analytics.
 *
 * Set EXPO_PUBLIC_AMPLITUDE_API_KEY in .env to enable. Without it, all helpers
 * are no-ops so local builds keep working.
 *
 * Requires a native/dev build (`expo run:ios` / `expo run:android`), not Expo Go.
 *
 * Dashboard charts (after data lands):
 * - Active Users → DAU / WAU / MAU
 * - Stickiness → DAU/MAU
 * - Sessions → sessions per user, avg session length, time in app
 * - Retention → D1 / D7 / D30 / D90 / D180
 *
 * Rodeo/content KPIs (group size, survival, msgs/photos) live in
 * supabase/analytics_kpis.sql — not Amplitude.
 */

import {
  Identify,
  identify,
  init,
  reset,
  setUserId,
  track,
} from '@amplitude/analytics-react-native';

import { env, isAmplitudeConfigured } from '@/lib/env';

let initPromise: Promise<boolean> | null = null;

function whenReady(action: () => void): void {
  if (!isAmplitudeConfigured || !env.EXPO_PUBLIC_AMPLITUDE_API_KEY) return;
  void initAnalytics().then((ready) => {
    if (ready) action();
  });
}

export function initAnalytics(): Promise<boolean> {
  if (!isAmplitudeConfigured || !env.EXPO_PUBLIC_AMPLITUDE_API_KEY) {
    return Promise.resolve(false);
  }
  if (initPromise) return initPromise;

  initPromise = init(env.EXPO_PUBLIC_AMPLITUDE_API_KEY, undefined, {
    disableCookies: true,
    trackingSessionEvents: true,
  })
    .promise.then(() => true)
    .catch(() => {
      initPromise = null;
      return false;
    });

  return initPromise;
}

export function identifyUser(
  userId: string,
  props?: { username?: string },
): void {
  whenReady(() => {
    setUserId(userId);
    if (props?.username) {
      const identifyObj = new Identify();
      identifyObj.set('username', props.username);
      identify(identifyObj);
    }
  });
}

export function resetAnalytics(): void {
  whenReady(() => {
    reset();
  });
}

export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  whenReady(() => {
    track(eventName, properties);
  });
}

export function trackRideCreated(rideId: string): void {
  trackEvent('ride_created', { ride_id: rideId });
}

/** Pending join request created (membership starts only after owner accepts). */
export function trackRideJoinRequested(rideId: string): void {
  trackEvent('ride_join_requested', { ride_id: rideId });
}

/** Membership granted after an owner accepts a join request. */
export function trackRideJoined(rideId: string, userId: string): void {
  trackEvent('ride_joined', { ride_id: rideId, joined_user_id: userId });
}

export function trackPostCreated(input: {
  rideIds: string[];
  postCount: number;
  hasAudio: boolean;
  hasVideo: boolean;
  isTemporary: boolean;
}): void {
  const props = {
    ride_count: input.rideIds.length,
    post_count: input.postCount,
  };

  if (input.isTemporary) {
    trackEvent('post_24h_created', props);
  } else {
    trackEvent('post_created', props);
  }

  if (input.hasVideo) {
    trackEvent('video_post', {
      ...props,
      is_temporary: input.isTemporary,
    });
  }

  if (input.hasAudio) {
    if (input.isTemporary) {
      trackEvent('post_with_audio_24', props);
    } else {
      trackEvent('post_with_audio', props);
    }
  }
}

export function trackCommentCreated(postId: string, commentId: string): void {
  trackEvent('comment_created', {
    post_id: postId,
    comment_id: commentId,
  });
}

/** User posted to a ride challenge — permanently unlocks challenge media. */
export function trackChallengeUnlocked(input: {
  rideId: string;
  rideChallengeId: string;
  postId?: string;
}): void {
  trackEvent('challenge_unlocked', {
    ride_id: input.rideId,
    ride_challenge_id: input.rideChallengeId,
    ...(input.postId ? { post_id: input.postId } : {}),
  });
}

/** Manual challenge open from the client (auto opens happen server-side). */
export function trackChallengeOpened(input: {
  rideId: string;
  rideChallengeId: string;
  challengeId: string;
  source: 'auto' | 'manual';
}): void {
  trackEvent('challenge_opened', {
    ride_id: input.rideId,
    ride_challenge_id: input.rideChallengeId,
    challenge_id: input.challengeId,
    source: input.source,
  });
}
