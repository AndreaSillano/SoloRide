import type { PostRecord } from './schemas';

export const POST_IMAGE_BUCKET = 'ride-posts';
/** Same private bucket as images; voice notes are stored as `.m4a`. */
export const POST_MEDIA_BUCKET = POST_IMAGE_BUCKET;
export const POST_IMAGE_MAX_LONG_EDGE = 1600;
export const POST_IMAGE_JPEG_QUALITY = 0.9;
export const POST_IMAGE_URL_TTL_SECONDS = 60 * 60;
export const POST_IMAGE_URL_EXPIRY_SAFETY_MS = 60_000;
/** Max voice-note length while recording on publish. */
export const POST_AUDIO_MAX_DURATION_MS = 30_000;
/** Max in-app video recording length; keeps uploads fast on cellular. */
export const POST_VIDEO_MAX_DURATION_MS = 15_000;
/** Long-edge cap for compressed upload (hard size control). */
export const POST_VIDEO_MAX_LONG_EDGE = 720;
/**
 * Target video bitrate after compression (~0.8 Mbps).
 * At ≤15s this keeps clips around 1–2 MB with H.264 + AAC.
 */
export const POST_VIDEO_TARGET_BITRATE = 800_000;
/** Soft ceiling after compression; reject outliers that still balloon storage. */
export const POST_VIDEO_MAX_BYTES = 3 * 1024 * 1024;
/** Max video posts a user may publish per calendar day (UTC). */
export const POST_VIDEO_MAX_PER_DAY = 2;
/** Post / camera frame aspect (width ÷ height). Portrait 3∶4. */
export const POST_IMAGE_ASPECT_RATIO = 3 / 4;

/**
 * Fit the feed post frame into available space.
 * Prefers full width (same as feed) when height allows; otherwise shrinks.
 */
export function getPostFrameSize(
  availableWidth: number,
  availableHeight: number,
  aspectRatio = POST_IMAGE_ASPECT_RATIO,
) {
  if (availableWidth <= 0 || availableHeight <= 0 || aspectRatio <= 0) {
    return { width: 0, height: 0 };
  }

  const heightFromWidth = availableWidth / aspectRatio;
  if (heightFromWidth <= availableHeight) {
    return { width: availableWidth, height: heightFromWidth };
  }

  return {
    width: availableHeight * aspectRatio,
    height: availableHeight,
  };
}

/** Center crop rect that yields `aspectRatio` from an arbitrary image size. */
export function getCenterCropRect(
  width: number,
  height: number,
  aspectRatio = POST_IMAGE_ASPECT_RATIO,
) {
  if (width <= 0 || height <= 0 || aspectRatio <= 0) {
    return { originX: 0, originY: 0, width: Math.max(0, width), height: Math.max(0, height) };
  }

  const imageAspect = width / height;
  if (imageAspect > aspectRatio) {
    const cropWidth = Math.round(height * aspectRatio);
    return {
      originX: Math.round((width - cropWidth) / 2),
      originY: 0,
      width: cropWidth,
      height,
    };
  }

  const cropHeight = Math.round(width / aspectRatio);
  return {
    originX: 0,
    originY: Math.round((height - cropHeight) / 2),
    width,
    height: cropHeight,
  };
}

/** Valid stored reaction scores: -3..-1 and +1..+3 (0 means cleared / no row). */
export type ReactionScore = -3 | -2 | -1 | 1 | 2 | 3;

export function isValidReactionScore(value: number): value is ReactionScore {
  return Number.isInteger(value) && value >= -3 && value <= 3 && value !== 0;
}

/** Icon pixel size for the feed stack — extremes are largest. */
export function reactionScoreToSize(score: number) {
  const magnitude = Math.min(3, Math.max(1, Math.abs(score)));
  if (magnitude >= 3) return 36;
  if (magnitude === 2) return 26;
  return 18;
}

/** Like / dislike emoji for a reaction score (0 has no emoji). */
export function reactionEmojiForScore(score: number) {
  if (score > 0) return '👍';
  if (score < 0) return '👎';
  return null;
}

/**
 * Feed sticker font size from net reaction sum — ten tiers up to 250.
 * Uses |sum| so stronger net reactions grow the sticker; caps at level 10.
 */
export function reactionSumToStickerSize(sum: number) {
  const level = Math.min(10, Math.max(1, Math.abs(sum)));
  const sizes = [56, 80, 104, 128, 152, 176, 200, 220, 230, 250] as const;
  return sizes[level - 1] ?? sizes[0];
}

/** Last N reaction scores for the feed stack: newest first, capped; `hasMore` when truncated. */
export function getReactionSummary(
  post: Pick<PostRecord, 'post_reactions'>,
  maximum = 3,
): { scores: number[]; hasMore: boolean } {
  const reactions = [...(post.post_reactions ?? [])].filter(
    (reaction): reaction is { user_id: string; score: number; updated_at?: string } =>
      typeof reaction?.score === 'number' && isValidReactionScore(reaction.score),
  );
  reactions.sort((a, b) => {
    const aTime = a.updated_at ? Date.parse(a.updated_at) : 0;
    const bTime = b.updated_at ? Date.parse(b.updated_at) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return 0;
  });
  const newestFirst = reactions.map((reaction) => reaction.score);
  const hasMore = newestFirst.length > maximum;
  // Left = newest (front of the stack), right = older of the shown set.
  const scores = newestFirst.slice(0, maximum);
  return { scores, hasMore };
}

export function getReactionCount(post: Pick<PostRecord, 'post_reactions'>) {
  return post.post_reactions?.length ?? 0;
}

/** Net reaction sentiment: sum of all scores on the post. */
export function getReactionScoreSum(post: Pick<PostRecord, 'post_reactions'>) {
  return (post.post_reactions ?? []).reduce((total, reaction) => {
    if (typeof reaction?.score !== 'number' || !isValidReactionScore(reaction.score)) {
      return total;
    }
    return total + reaction.score;
  }, 0);
}

export function getOwnReactionScore(
  post: Pick<PostRecord, 'post_reactions'>,
  userId: string | null | undefined,
) {
  if (!userId) return null;
  const score = post.post_reactions?.find((reaction) => reaction.user_id === userId)?.score;
  return typeof score === 'number' && isValidReactionScore(score) ? score : null;
}

export function buildPostImagePath(rideId: string, userId: string, postId: string) {
  return `${rideId}/${userId}/${postId}.jpg`;
}

export function buildPostAudioPath(rideId: string, userId: string, postId: string) {
  return `${rideId}/${userId}/${postId}.m4a`;
}

export function buildPostVideoPath(rideId: string, userId: string, postId: string) {
  return `${rideId}/${userId}/${postId}.mp4`;
}

/** Format seconds as m:ss for recorders and players. */
export function formatAudioDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function getCommentCount(post: Pick<PostRecord, 'comments'>) {
  return post.comments?.[0]?.count ?? 0;
}

/** SoloRide identity is the username; display_name is optional polish.
 * When the author left the Ride, RLS hides their profile — use a clear
 * “ex” label instead of a generic member placeholder. */
export function formatProfileName(
  profile:
    | {
        username?: string | null;
        display_name?: string | null;
      }
    | null
    | undefined,
  fallback = 'Ex-ride member',
) {
  const username = profile?.username?.trim();
  if (username) return username;
  const displayName = profile?.display_name?.trim();
  if (displayName) return displayName;
  return fallback;
}

export function getResizeDimensions(
  width: number,
  height: number,
  maximumLongEdge = POST_IMAGE_MAX_LONG_EDGE,
) {
  if (width <= maximumLongEdge && height <= maximumLongEdge) return null;
  return width >= height
    ? { width: maximumLongEdge, height: null }
    : { width: null, height: maximumLongEdge };
}

export type AddressParts = {
  formattedAddress?: string | null;
  name?: string | null;
  streetNumber?: string | null;
  street?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

export function formatLocationLabel(address: AddressParts | null | undefined) {
  if (!address) return null;
  if (address.formattedAddress?.trim()) return address.formattedAddress.trim();

  const street = [address.streetNumber, address.street]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  const parts = [address.name, street, address.city, address.region, address.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return [...new Set(parts)].join(', ') || null;
}
