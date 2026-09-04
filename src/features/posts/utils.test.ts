import { describe, expect, it } from 'vitest';

import { mapDatabaseError, mapUploadError } from './errors';
import {
  createPostInputSchema,
  upsertReactionInputSchema,
} from './schemas';
import {
  buildPostAudioPath,
  buildPostImagePath,
  buildPostVideoPath,
  formatLocationLabel,
  getOwnReactionScore,
  getReactionCount,
  getReactionSummary,
  getResizeDimensions,
  getCenterCropRect,
  getPostFrameSize,
  isValidReactionScore,
  reactionScoreToSize,
  reactionSumToStickerSize,
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

  it('builds the private audio path required by the backend', () => {
    expect(buildPostAudioPath(rideId, userId, postId)).toBe(
      `${rideId}/${userId}/${postId}.m4a`,
    );
  });

  it('builds the private video path required by the backend', () => {
    expect(buildPostVideoPath(rideId, userId, postId)).toBe(
      `${rideId}/${userId}/${postId}.mp4`,
    );
  });

  it('only downsizes the long edge and preserves aspect ratio', () => {
    expect(getResizeDimensions(2400, 1200)).toEqual({
      width: 1600,
      height: null,
    });
    expect(getResizeDimensions(800, 1200)).toBeNull();
  });

  it('center-crops to the post 3:4 frame', () => {
    expect(getCenterCropRect(1200, 1200)).toEqual({
      originX: 150,
      originY: 0,
      width: 900,
      height: 1200,
    });
    expect(getCenterCropRect(900, 1600)).toEqual({
      originX: 0,
      originY: 200,
      width: 900,
      height: 1200,
    });
    expect(getCenterCropRect(900, 1200)).toEqual({
      originX: 0,
      originY: 0,
      width: 900,
      height: 1200,
    });
  });

  it('fits the post frame preferring full feed width', () => {
    expect(getPostFrameSize(390, 600)).toEqual({ width: 390, height: 520 });
    expect(getPostFrameSize(390, 400)).toEqual({ width: 300, height: 400 });
    expect(getPostFrameSize(0, 400)).toEqual({ width: 0, height: 0 });
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
      rideIds: [rideId],
      imageUri: 'file:///photo.jpg',
      description: '   ',
      locationName: '  Riverside  ',
      scheduledDate: '2026-07-28',
    });

    expect(result).toMatchObject({
      rideIds: [rideId],
      description: null,
      locationName: 'Riverside',
      latitude: null,
      longitude: null,
      isTemporary: false,
    });
  });

  it('accepts temporary post input', () => {
    const result = createPostInputSchema.parse({
      rideIds: [rideId],
      imageUri: 'file:///photo.jpg',
      scheduledDate: '2026-07-28',
      isTemporary: true,
    });

    expect(result.isTemporary).toBe(true);
    expect(result.rideIds).toEqual([rideId]);
  });

  it('accepts multiple rides for a permanent post', () => {
    const secondRideId = '44444444-4444-4444-8444-444444444444';
    const result = createPostInputSchema.parse({
      rideIds: [rideId, secondRideId],
      imageUri: 'file:///photo.jpg',
      scheduledDate: '2026-07-28',
      isTemporary: false,
    });

    expect(result.rideIds).toEqual([rideId, secondRideId]);
    expect(result.isTemporary).toBe(false);
  });

  it('rejects temporary posts with multiple rides', () => {
    const secondRideId = '44444444-4444-4444-8444-444444444444';
    const result = createPostInputSchema.safeParse({
      rideIds: [rideId, secondRideId],
      imageUri: 'file:///photo.jpg',
      scheduledDate: '2026-07-28',
      isTemporary: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty ride list', () => {
    const result = createPostInputSchema.safeParse({
      rideIds: [],
      imageUri: 'file:///photo.jpg',
      scheduledDate: '2026-07-28',
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate ride ids', () => {
    const result = createPostInputSchema.safeParse({
      rideIds: [rideId, rideId],
      imageUri: 'file:///photo.jpg',
      scheduledDate: '2026-07-28',
    });

    expect(result.success).toBe(false);
  });

  it('rejects incomplete coordinate pairs', () => {
    const result = createPostInputSchema.safeParse({
      rideIds: [rideId],
      imageUri: 'file:///photo.jpg',
      scheduledDate: '2026-07-28',
      latitude: 44,
    });

    expect(result.success).toBe(false);
  });

  it('accepts a video post with its thumbnail and duration', () => {
    const result = createPostInputSchema.parse({
      rideIds: [rideId],
      imageUri: 'file:///thumbnail.jpg',
      videoUri: 'file:///clip.mp4',
      videoDurationMs: 12_000,
      scheduledDate: '2026-07-28',
    });

    expect(result.videoUri).toBe('file:///clip.mp4');
    expect(result.videoDurationMs).toBe(12_000);
  });

  it('rejects a video without its recorded duration', () => {
    const result = createPostInputSchema.safeParse({
      rideIds: [rideId],
      imageUri: 'file:///thumbnail.jpg',
      videoUri: 'file:///clip.mp4',
      scheduledDate: '2026-07-28',
    });

    expect(result.success).toBe(false);
  });

  it('rejects videos longer than the recording cap', () => {
    const result = createPostInputSchema.safeParse({
      rideIds: [rideId],
      imageUri: 'file:///thumbnail.jpg',
      videoUri: 'file:///clip.mp4',
      videoDurationMs: 20_000,
      scheduledDate: '2026-07-28',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a post carrying both a voice note and a video', () => {
    const result = createPostInputSchema.safeParse({
      rideIds: [rideId],
      imageUri: 'file:///thumbnail.jpg',
      audioUri: 'file:///note.m4a',
      videoUri: 'file:///clip.mp4',
      videoDurationMs: 5_000,
      scheduledDate: '2026-07-28',
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
      mapDatabaseError(
        { code: 'P0001', message: 'Daily video limit reached (max 2 per day)' },
        'fallback',
      ).code,
    ).toBe('VIDEO_DAILY_LIMIT');
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

  it('accepts valid reaction scores and rejects zero', () => {
    expect(isValidReactionScore(3)).toBe(true);
    expect(isValidReactionScore(-2)).toBe(true);
    expect(isValidReactionScore(0)).toBe(false);
    expect(isValidReactionScore(4)).toBe(false);
    expect(reactionScoreToSize(1)).toBe(18);
    expect(reactionScoreToSize(-3)).toBe(36);
    expect(reactionSumToStickerSize(1)).toBe(56);
    expect(reactionSumToStickerSize(-2)).toBe(80);
    expect(reactionSumToStickerSize(5)).toBe(152);
    expect(reactionSumToStickerSize(10)).toBe(250);
    expect(reactionSumToStickerSize(20)).toBe(250);
  });

  it('validates reaction upsert input', () => {
    expect(
      upsertReactionInputSchema.parse({
        postId,
        rideId,
        score: 3,
      }),
    ).toEqual({ postId, rideId, score: 3 });

    expect(
      upsertReactionInputSchema.safeParse({
        postId,
        rideId,
        score: 0,
      }).success,
    ).toBe(false);
  });

  it('summarizes the last feed reactions by score', () => {
    const post = {
      post_reactions: [
        { user_id: userId, score: 1, updated_at: '2026-07-28T12:00:00Z' },
        {
          user_id: '44444444-4444-4444-8444-444444444444',
          score: -2,
          updated_at: '2026-07-28T12:01:00Z',
        },
        {
          user_id: '55555555-5555-4555-8555-555555555555',
          score: 3,
          updated_at: '2026-07-28T12:02:00Z',
        },
        {
          user_id: '66666666-6666-4666-8666-666666666666',
          score: -1,
          updated_at: '2026-07-28T12:03:00Z',
        },
        {
          user_id: '77777777-7777-4777-8777-777777777777',
          score: 2,
          updated_at: '2026-07-28T12:04:00Z',
        },
      ],
    };

    expect(getReactionCount(post)).toBe(5);
    expect(getReactionSummary(post)).toEqual({
      scores: [2, -1, 3],
      hasMore: true,
    });
    expect(getReactionSummary(post, 10)).toEqual({
      scores: [2, -1, 3, -2, 1],
      hasMore: false,
    });
    expect(getOwnReactionScore(post, userId)).toBe(1);
    expect(getOwnReactionScore(post, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('ranks challenge entries by reaction score sum then positive count', async () => {
    const { compareChallengeEntries, getPositiveReactionCount, getReactionScoreSum } =
      await import('./utils');
    const manySmall = {
      id: 'a',
      created_at: '2026-09-01T12:00:00Z',
      post_reactions: [
        { user_id: '1', score: 1 },
        { user_id: '2', score: 1 },
        { user_id: '3', score: 1 },
      ],
    };
    const fewStrong = {
      id: 'b',
      created_at: '2026-09-01T11:00:00Z',
      post_reactions: [
        { user_id: '1', score: 3 },
        { user_id: '2', score: 2 },
      ],
    };
    const disliked = {
      id: 'c',
      created_at: '2026-09-01T13:00:00Z',
      post_reactions: [{ user_id: '1', score: -3 }],
    };

    expect(getPositiveReactionCount(manySmall)).toBe(3);
    expect(getReactionScoreSum(fewStrong)).toBe(5);
    expect([manySmall, fewStrong, disliked].sort(compareChallengeEntries).map((p) => p.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
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
      post_reactions: [{ user_id: userId, score: 2 }],
    });

    expect(parsed.post_reactions).toEqual([{ user_id: userId, score: 2 }]);
  });
});
