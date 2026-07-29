import { describe, expect, it } from 'vitest';

import { mapDatabaseError, mapUploadError } from './errors';
import {
  createPostInputSchema,
  upsertReactionInputSchema,
} from './schemas';
import {
  buildPostImagePath,
  formatLocationLabel,
  getOwnReactionEmoji,
  getReactionCount,
  getReactionSummary,
  getResizeDimensions,
  isReactionEmoji,
  REACTION_OPTIONS,
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
      isTemporary: false,
    });
  });

  it('accepts temporary post input', () => {
    const result = createPostInputSchema.parse({
      rideId,
      imageUri: 'file:///photo.jpg',
      scheduledDate: '2026-07-28',
      isTemporary: true,
    });

    expect(result.isTemporary).toBe(true);
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
      mapDatabaseError(
        { code: 'P0001', message: 'Temporary photo limit reached (max 3 active per ride)' },
        'fallback',
      ).code,
    ).toBe('TEMPORARY_LIMIT');
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
      is_temporary: true,
      expires_at: '2026-07-29T12:00:00Z',
      created_at: '2026-07-28T12:00:00Z',
      updated_at: '2026-07-28T12:00:00Z',
      profile: null,
      comments: null,
    });

    expect(parsed.latitude).toBeCloseTo(44.05);
    expect(parsed.longitude).toBeCloseTo(-121.3);
    expect(parsed.profile).toBeNull();
    expect(parsed.is_temporary).toBe(true);
    expect(parsed.expires_at).toBe('2026-07-29T12:00:00Z');
  });

  it('defaults missing temporary flags on feed rows', async () => {
    const { postSchema } = await import('./schemas');
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
      profile: null,
      comments: null,
    });

    expect(parsed.is_temporary).toBe(false);
    expect(parsed.expires_at).toBeNull();
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

  it('exposes five easy-to-edit reaction options', () => {
    expect(REACTION_OPTIONS).toHaveLength(5);
    expect(isReactionEmoji('🔥')).toBe(true);
    expect(isReactionEmoji('❤️')).toBe(false);
    expect(isReactionEmoji('👋')).toBe(false);
  });

  it('accepts emoji graphemes and rejects plain text', async () => {
    const { isEmojiGrapheme, isValidReactionValue } = await import('./utils');
    expect(isEmojiGrapheme('🔥')).toBe(true);
    expect(isEmojiGrapheme('hello')).toBe(false);
    expect(isValidReactionValue('🔥')).toBe(true);
    expect(isValidReactionValue('abc')).toBe(false);
  });

  it('validates reaction upsert input', () => {
    expect(
      upsertReactionInputSchema.parse({
        postId,
        rideId,
        emoji: '🔥',
      }),
    ).toEqual({ postId, rideId, emoji: '🔥' });

    expect(
      upsertReactionInputSchema.safeParse({
        postId,
        rideId,
        emoji: '',
      }).success,
    ).toBe(false);
  });

  it('summarizes feed reactions without duplicates', () => {
    const post = {
      post_reactions: [
        { user_id: userId, emoji: '🔥' },
        { user_id: '44444444-4444-4444-8444-444444444444', emoji: '❤️' },
        { user_id: '55555555-5555-4555-8555-555555555555', emoji: '🔥' },
        { user_id: '66666666-6666-4666-8666-666666666666', emoji: '😂' },
        { user_id: '77777777-7777-4777-8777-777777777777', emoji: '👎' },
      ],
    };

    expect(getReactionCount(post)).toBe(5);
    expect(getReactionSummary(post)).toEqual({
      emojis: ['🔥', '😂', '👎'],
      hasMore: true,
    });
    expect(getReactionSummary(post, 10)).toEqual({
      emojis: ['❤️', '🔥', '😂', '👎'],
      hasMore: false,
    });
    expect(getOwnReactionEmoji(post, userId)).toBe('🔥');
    expect(getOwnReactionEmoji(post, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('parses embedded post reactions on feed rows', async () => {
    const { postSchema } = await import('./schemas');
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
      profile: null,
      comments: [{ count: 2 }],
      post_reactions: [{ user_id: userId, emoji: '🔥' }],
    });

    expect(parsed.post_reactions).toEqual([{ user_id: userId, emoji: '🔥' }]);
  });
});
