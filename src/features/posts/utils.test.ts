import { describe, expect, it } from 'vitest';

import { mapDatabaseError, mapUploadError } from './errors';
import { createPostInputSchema } from './schemas';
import {
  buildPostImagePath,
  formatLocationLabel,
  getResizeDimensions,
} from './utils';

const rideId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const postId = '33333333-3333-4333-8333-333333333333';

describe('post data utilities', () => {
  it('builds the private bucket path required by the backend', () => {
    expect(buildPostImagePath(rideId, userId, postId)).toBe(
      `${rideId}/${userId}/${postId}.jpg`,
    );
  });

  it('only downsizes the long edge and preserves aspect ratio', () => {
    expect(getResizeDimensions(2400, 1200)).toEqual({
      width: 1600,
      height: null,
    });
    expect(getResizeDimensions(800, 1200)).toBeNull();
  });

  it('formats a useful reverse-geocoded label', () => {
    expect(
      formatLocationLabel({
        name: 'Trailhead',
        streetNumber: '12',
        street: 'River Road',
        city: 'Bend',
        region: 'Oregon',
      }),
    ).toBe('Trailhead, 12 River Road, Bend, Oregon');
  });

  it('normalizes optional post text and coordinates', () => {
    const result = createPostInputSchema.parse({
      rideId,
      imageUri: 'file:///photo.jpg',
      description: '   ',
      locationName: '  Riverside  ',
      scheduledDate: '2026-07-28',
    });

    expect(result).toMatchObject({
      description: null,
      locationName: 'Riverside',
      latitude: null,
      longitude: null,
    });
  });

  it('rejects incomplete coordinate pairs', () => {
    const result = createPostInputSchema.safeParse({
      rideId,
      imageUri: 'file:///photo.jpg',
      scheduledDate: '2026-07-28',
      latitude: 44,
    });

    expect(result.success).toBe(false);
  });

  it('maps duplicate and offline failures to actionable errors', () => {
    expect(mapDatabaseError({ code: '23505' }, 'fallback').code).toBe(
      'DUPLICATE_POST',
    );
    expect(
      mapUploadError(new TypeError('Network request failed')).code,
    ).toBe('NETWORK');
  });

  it('accepts null profiles and string coordinates from PostgREST', async () => {
    const { postSchema } = await import('./schemas');
    const parsed = postSchema.parse({
      id: postId,
      ride_id: rideId,
      user_id: userId,
      image_path: `${rideId}/${userId}/${postId}.jpg`,
      description: null,
      latitude: '44.05',
      longitude: '-121.3',
      location_name: 'Bend',
      scheduled_date: '2026-07-28',
      created_at: '2026-07-28T12:00:00Z',
      updated_at: '2026-07-28T12:00:00Z',
      profile: null,
      comments: null,
    });

    expect(parsed.latitude).toBeCloseTo(44.05);
    expect(parsed.longitude).toBeCloseTo(-121.3);
    expect(parsed.profile).toBeNull();
  });

  it('unwraps array-shaped profile embeds from PostgREST', async () => {
    const { postSchema } = await import('./schemas');
    const { formatProfileName } = await import('./utils');
    const parsed = postSchema.parse({
      id: postId,
      ride_id: rideId,
      user_id: userId,
      image_path: `${rideId}/${userId}/${postId}.jpg`,
      description: null,
      latitude: null,
      longitude: null,
      location_name: null,
      scheduled_date: '2026-07-28',
      created_at: '2026-07-28T12:00:00Z',
      updated_at: '2026-07-28T12:00:00Z',
      profile: [
        {
          id: userId,
          username: 'andreas',
          display_name: 'Someone Else',
          avatar_url: null,
        },
      ],
    });

    expect(formatProfileName(parsed.profile)).toBe('andreas');
  });
});
