import type { PostRecord } from './schemas';

export const POST_IMAGE_BUCKET = 'ride-posts';
export const POST_IMAGE_MAX_LONG_EDGE = 1600;
export const POST_IMAGE_JPEG_QUALITY = 0.9;
export const POST_IMAGE_URL_TTL_SECONDS = 60 * 60;
export const POST_IMAGE_URL_EXPIRY_SAFETY_MS = 60_000;

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
