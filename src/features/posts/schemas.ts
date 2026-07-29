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

export const postSchema = z.object({
  id: uuidSchema,
  ride_id: uuidSchema,
  user_id: uuidSchema,
  image_path: z.string().min(1).max(512),
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

export const createPostInputSchema = z
  .object({
    rideId: uuidSchema,
    imageUri: z.string().min(1, 'Choose an image first.'),
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
  })
  .transform((value) => ({
    ...value,
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    isTemporary: value.isTemporary ?? false,
  }));

export const createCommentInputSchema = z.object({
  postId: uuidSchema,
  rideId: uuidSchema,
  content: z.string().trim().min(1, 'Write a comment first.').max(2000),
});

export type PostRecord = z.infer<typeof postSchema>;
export type CommentRecord = z.infer<typeof commentSchema>;
export type CreatePostInput = z.input<typeof createPostInputSchema>;
export type CreateCommentInput = z.input<typeof createCommentInputSchema>;
