import type { PostRecord } from './schemas';

export const POST_IMAGE_BUCKET = 'ride-posts';
export const POST_IMAGE_MAX_LONG_EDGE = 1600;
export const POST_IMAGE_JPEG_QUALITY = 0.9;
export const POST_IMAGE_URL_TTL_SECONDS = 60 * 60;
export const POST_IMAGE_URL_EXPIRY_SAFETY_MS = 60_000;

/**
 * Five quick-pick reactions (+ custom in the picker fills a 3×2 grid).
 * Edit this list to change what the picker offers.
 */
export const REACTION_OPTIONS = ['🔥', '😂', '👎', '💩', '😤'] as const;

export type ReactionEmoji = (typeof REACTION_OPTIONS)[number];

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_OPTIONS as readonly string[]).includes(value);
}

/** First user-perceived character (emoji-aware when Segmenter is available). */
export function firstGrapheme(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next().value as
      | { segment: string }
      | undefined;
    const grapheme = first?.segment?.trim();
    return grapheme || null;
  }
  return [...trimmed][0] ?? null;
}

/** True when the string is a single emoji grapheme (not letters/digits). */
export function isEmojiGrapheme(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16) return false;
  if (/[A-Za-z0-9]/.test(trimmed)) return false;
  try {
    return /\p{Extended_Pictographic}/u.test(trimmed);
  } catch {
    // Older runtimes without Unicode property escapes.
    return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(trimmed);
  }
}

/** Preset or any short custom emoji string stored on a reaction. */
export function isValidReactionValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16) return false;
  return isReactionEmoji(trimmed) || isEmojiGrapheme(trimmed);
}

/** Distinct emoji for the feed stack: newest first, capped; `hasMore` when truncated. */
export function getReactionSummary(
  post: Pick<PostRecord, 'post_reactions'>,
  maximum = 3,
): { emojis: string[]; hasMore: boolean } {
  const seen = new Set<string>();
  const newestFirst: string[] = [];
  const reactions = post.post_reactions ?? [];
  for (let index = reactions.length - 1; index >= 0; index -= 1) {
    const emoji = reactions[index]?.emoji;
    if (!emoji || seen.has(emoji)) continue;
    seen.add(emoji);
    newestFirst.push(emoji);
  }
  const hasMore = newestFirst.length > maximum;
  // Left = older of the shown set, right = newest (front of the stack).
  const emojis = newestFirst.slice(0, maximum).reverse();
  return { emojis, hasMore };
}

export function getReactionCount(post: Pick<PostRecord, 'post_reactions'>) {
  return post.post_reactions?.length ?? 0;
}

export function getOwnReactionEmoji(
  post: Pick<PostRecord, 'post_reactions'>,
  userId: string | null | undefined,
) {
  if (!userId) return null;
  return post.post_reactions?.find((reaction) => reaction.user_id === userId)?.emoji ?? null;
}

export function buildPostImagePath(rideId: string, userId: string, postId: string) {
  return `${rideId}/${userId}/${postId}.jpg`;
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
