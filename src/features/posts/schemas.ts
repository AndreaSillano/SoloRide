import { z } from 'zod';

const nullableTrimmedString = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .nullable()
    .transform((value) => value || null);

/** PostgREST may return doubles as numbers or strings; null stays null. */
const nullableCoordinate = (min: number, max: number) =>
  z.preprocess((value) => {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  }, z.number().min(min).max(max).nullable());

export const uuidSchema = z.string().uuid();
export const scheduledDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD scheduled date.');

export const postProfileSchema = z.object({
  id: uuidSchema,
  username: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

/** PostgREST sometimes returns a many-embedding as a one-element array. */
const embeddedProfileSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}, postProfileSchema.nullish());

/** Compact embed used on feed rows (score + who, no nested profile). */
export const postReactionEmbedSchema = z.object({
  user_id: uuidSchema,
  score: z.number().int().min(-3).max(3),
  updated_at: z.string().optional(),
});

export const postSchema = z.object({
  id: uuidSchema,
  ride_id: uuidSchema,
  user_id: uuidSchema,
  image_path: z.string().min(1).max(512),
  audio_path: z
    .string()
    .min(1)
    .max(512)
    .nullish()
    .transform((value) => value ?? null),
  video_path: z
    .string()
    .min(1)
    .max(512)
    .nullish()
    .transform((value) => value ?? null),
  video_duration_ms: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? null),
  description: z.string().nullable(),
  latitude: nullableCoordinate(-90, 90),
  longitude: nullableCoordinate(-180, 180),
  location_name: z.string().nullable(),
  scheduled_date: scheduledDateSchema,
  is_temporary: z.boolean().default(false),
  expires_at: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  profile: embeddedProfileSchema,
  comments: z.array(z.object({ count: z.number() })).nullish(),
  post_reactions: z.array(postReactionEmbedSchema).nullish(),
});

export const commentSchema = z.object({
  id: uuidSchema,
  post_id: uuidSchema,
  user_id: uuidSchema,
  content: z.string().min(1).max(2000),
  created_at: z.string(),
  updated_at: z.string(),
  profile: embeddedProfileSchema,
});

export const reactionSchema = z.object({
  id: uuidSchema,
  post_id: uuidSchema,
  user_id: uuidSchema,
  score: z.number().int().min(-3).max(3),
  created_at: z.string(),
  updated_at: z.string(),
  profile: embeddedProfileSchema,
});

/** Cover photo, or the generated thumbnail frame when the post is a video. */
export const createPostInputSchema = z
  .object({
    rideIds: z.array(uuidSchema).min(1, 'Choose at least one Ride.'),
    imageUri: z.string().min(1, 'Choose an image first.'),
    audioUri: z.string().min(1).optional().nullable(),
    videoUri: z.string().min(1).optional().nullable(),
    videoDurationMs: z.number().int().positive().max(15_000).optional().nullable(),
    description: nullableTrimmedString(50),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    locationName: nullableTrimmedString(200),
    scheduledDate: scheduledDateSchema,
    isTemporary: z.boolean().optional().default(false),
  })
  .superRefine((value, context) => {
    if ((value.latitude == null) !== (value.longitude == null)) {
      context.addIssue({
        code: 'custom',
        message: 'Latitude and longitude must be provided together.',
        path: ['latitude'],
      });
    }
    if (Boolean(value.videoUri) !== (value.videoDurationMs != null)) {
      context.addIssue({
        code: 'custom',
        message: 'A video needs its duration recorded alongside it.',
        path: ['videoUri'],
      });
    }
    if (value.videoUri && value.audioUri) {
      context.addIssue({
        code: 'custom',
        message: 'A post can carry a voice note or a video, not both.',
        path: ['audioUri'],
      });
    }
    const uniqueRideIds = new Set(value.rideIds);
    if (uniqueRideIds.size !== value.rideIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Each Ride can only be selected once.',
        path: ['rideIds'],
      });
    }
    if ((value.isTemporary ?? false) && uniqueRideIds.size > 1) {
      context.addIssue({
        code: 'custom',
        message: '24-hour photos can only be shared to one Ride.',
        path: ['rideIds'],
      });
    }
    if (value.videoUri && uniqueRideIds.size > 1) {
      context.addIssue({
        code: 'custom',
        message: 'Videos can only be shared to one Ride.',
        path: ['rideIds'],
      });
    }
  })
  .transform((value) => ({
    ...value,
    rideIds: [...new Set(value.rideIds)],
    audioUri: value.audioUri?.trim() || null,
    videoUri: value.videoUri?.trim() || null,
    videoDurationMs: value.videoUri?.trim() ? (value.videoDurationMs ?? null) : null,
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    isTemporary: value.isTemporary ?? false,
  }));

export const createCommentInputSchema = z.object({
  postId: uuidSchema,
  rideId: uuidSchema,
  content: z.string().trim().min(1, 'Write a comment first.').max(2000),
});

export const upsertReactionInputSchema = z.object({
  postId: uuidSchema,
  rideId: uuidSchema,
  score: z
    .number()
    .int()
    .min(-3, 'Pick a reaction.')
    .max(3, 'Pick a reaction.')
    .refine((value) => value !== 0, 'Pick a reaction.'),
});

export const removeReactionInputSchema = z.object({
  postId: uuidSchema,
  rideId: uuidSchema,
});

export type PostRecord = z.infer<typeof postSchema>;
export type CommentRecord = z.infer<typeof commentSchema>;
export type ReactionRecord = z.infer<typeof reactionSchema>;
export type CreatePostInput = z.input<typeof createPostInputSchema>;
export type CreateCommentInput = z.input<typeof createCommentInputSchema>;
export type UpsertReactionInput = z.input<typeof upsertReactionInputSchema>;
export type RemoveReactionInput = z.input<typeof removeReactionInputSchema>;
