import * as Crypto from 'expo-crypto';

import { trackCommentCreated, trackPostCreated } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

import {
  mapDatabaseError,
  mapUploadError,
  PostDataError,
} from './errors';
import { preparePostAudio } from './audio';
import { preparePostImage } from './image';
import { preparePostVideo } from './video';
import {
  commentSchema,
  createCommentInputSchema,
  createPostInputSchema,
  removeReactionInputSchema,
  type CommentRecord,
  type CreateCommentInput,
  type CreatePostInput,
  type PostRecord,
  type ReactionRecord,
  type RemoveReactionInput,
  type UpsertReactionInput,
  postSchema,
  reactionSchema,
  upsertReactionInputSchema,
  uuidSchema,
} from './schemas';
import {
  buildPostAudioPath,
  buildPostImagePath,
  buildPostVideoPath,
  isValidReactionScore,
  POST_IMAGE_BUCKET,
  POST_IMAGE_URL_TTL_SECONDS,
  POST_MEDIA_BUCKET,
} from './utils';

const POST_SELECT = `
  id, ride_id, user_id, image_path, audio_path, video_path, video_duration_ms,
  description, latitude, longitude,
  location_name, scheduled_date, is_temporary, expires_at, created_at, updated_at,
  profile:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
  comments(count),
  post_reactions(user_id, score, updated_at)
`;

/** Hide expired temporary posts until cleanup deletes them. */
function activeFeedFilter() {
  return `is_temporary.eq.false,expires_at.gt.${new Date().toISOString()}`;
}

const COMMENT_SELECT = `
  id, post_id, user_id, content, created_at, updated_at,
  profile:profiles!comments_user_id_fkey(id, username, display_name, avatar_url)
`;

const REACTION_SELECT = `
  id, post_id, user_id, score, created_at, updated_at,
  profile:profiles!post_reactions_user_id_fkey(id, username, display_name, avatar_url)
`;

const REACTION_SELECT_PLAIN = `
  id, post_id, user_id, score, created_at, updated_at
`;

function isMissingRelationshipError(error: unknown) {
  const message = String(
    typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message?: unknown }).message
      : error,
  ).toLowerCase();
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  return (
    code === 'PGRST200' ||
    message.includes('could not find a relationship') ||
    message.includes('schema cache')
  );
}

async function selectReactionRow(filter: {
  id?: string;
  postId?: string;
  userId?: string;
}): Promise<ReactionRecord> {
  let query = supabase.from('post_reactions').select(REACTION_SELECT);
  if (filter.id) query = query.eq('id', filter.id);
  if (filter.postId) query = query.eq('post_id', filter.postId);
  if (filter.userId) query = query.eq('user_id', filter.userId);

  const { data, error } = await query.maybeSingle();
  if (!error) {
    if (!data) {
      throw new PostDataError('NOT_FOUND', 'The reaction could not be found.');
    }
    return parseFeedReaction(data);
  }

  if (!isMissingRelationshipError(error)) {
    throw mapDatabaseError(error, 'The reaction could not be saved.');
  }

  // Schema cache may lag right after the migration; return without profile.
  let plain = supabase.from('post_reactions').select(REACTION_SELECT_PLAIN);
  if (filter.id) plain = plain.eq('id', filter.id);
  if (filter.postId) plain = plain.eq('post_id', filter.postId);
  if (filter.userId) plain = plain.eq('user_id', filter.userId);
  const { data: row, error: plainError } = await plain.maybeSingle();
  if (plainError) {
    throw mapDatabaseError(plainError, 'The reaction could not be saved.');
  }
  if (!row) {
    throw new PostDataError('NOT_FOUND', 'The reaction could not be found.');
  }
  return parseFeedReaction({ ...row, profile: null });
}

function parseUuid(value: string, label: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new PostDataError('INVALID_INPUT', `${label} is invalid.`);
  }
  return parsed.data;
}

function parseFeedPosts(data: unknown): PostRecord[] {
  const parsed = postSchema.array().safeParse(data);
  if (!parsed.success) {
    throw new PostDataError('DATABASE', 'The Ride feed could not be loaded.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function parseFeedPost(data: unknown): PostRecord {
  const parsed = postSchema.safeParse(data);
  if (!parsed.success) {
    throw new PostDataError('DATABASE', 'The post could not be loaded.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function parseFeedComments(data: unknown): CommentRecord[] {
  const parsed = commentSchema.array().safeParse(data);
  if (!parsed.success) {
    throw new PostDataError('DATABASE', 'Comments could not be loaded.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function parseFeedReactions(data: unknown): ReactionRecord[] {
  const parsed = reactionSchema.array().safeParse(data);
  if (!parsed.success) {
    throw new PostDataError('DATABASE', 'Reactions could not be loaded.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function parseFeedReaction(data: unknown): ReactionRecord {
  const parsed = reactionSchema.safeParse(data);
  if (!parsed.success) {
    throw new PostDataError('DATABASE', 'The reaction could not be saved.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw mapDatabaseError(error, 'We could not verify your account.');
  if (!data.user) {
    throw new PostDataError('AUTH_REQUIRED', 'Sign in to continue.');
  }
  return data.user.id;
}

/** Start of the current UTC calendar day (matches the DB daily video cap). */
function startOfUtcDayIso() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

/** How many video posts the signed-in user has created today (UTC). */
export async function getTodayVideoPostCount(): Promise<number> {
  const userId = await requireUserId();
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('video_path', 'is', null)
    .gte('created_at', startOfUtcDayIso());

  if (error) {
    throw mapDatabaseError(error, 'Could not check today\'s video limit.');
  }
  return count ?? 0;
}

/** First page + each scroll page of the Ride photo feed. */
export const RIDE_FEED_PAGE_SIZE = 8;

export type RideFeedPage = {
  posts: PostRecord[];
  /** `created_at` of the oldest post in this page; null when no further pages. */
  nextCursor: string | null;
};

export async function getRideFeedPage(
  rideId: string,
  cursor: string | null = null,
): Promise<RideFeedPage> {
  const validRideId = parseUuid(rideId, 'Ride');
  // Fetch one extra row so we know whether another page exists without a count query.
  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('ride_id', validRideId)
    .or(activeFeedFilter())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(RIDE_FEED_PAGE_SIZE + 1);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;
  if (error) throw mapDatabaseError(error, 'The Ride feed could not be loaded.');

  const rows = parseFeedPosts(data ?? []);
  const hasMore = rows.length > RIDE_FEED_PAGE_SIZE;
  const posts = hasMore ? rows.slice(0, RIDE_FEED_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? posts[posts.length - 1]?.created_at ?? null : null;
  return { posts, nextCursor };
}

/** Distinct scheduled dates (YYYY-MM-DD) that still have posts in a range. */
export async function getRidePostDates(
  rideId: string,
  fromDate: string,
  toDate: string,
): Promise<string[]> {
  const validRideId = parseUuid(rideId, 'Ride');
  const { data, error } = await supabase
    .from('posts')
    .select('scheduled_date')
    .eq('ride_id', validRideId)
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', fromDate)
    .lte('scheduled_date', toDate);

  if (error) throw mapDatabaseError(error, 'Post days could not be loaded.');

  const dates = new Set<string>();
  for (const row of data ?? []) {
    const value = (row as { scheduled_date?: string | null }).scheduled_date;
    if (typeof value === 'string' && value.length >= 10) {
      dates.add(value.slice(0, 10));
    }
  }
  return [...dates].sort();
}

/** All posts for one scheduled calendar day in a Ride (history, including expired). */
export async function getRidePostsForDate(
  rideId: string,
  scheduledDate: string,
): Promise<PostRecord[]> {
  const validRideId = parseUuid(rideId, 'Ride');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    throw new PostDataError('INVALID_INPUT', 'That date is invalid.');
  }

  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('ride_id', validRideId)
    .eq('scheduled_date', scheduledDate)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw mapDatabaseError(error, 'The day feed could not be loaded.');
  return parseFeedPosts(data ?? []);
}

export async function getPost(postId: string): Promise<PostRecord> {
  const validPostId = parseUuid(postId, 'Post');
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', validPostId)
    .or(activeFeedFilter())
    .maybeSingle();

  if (error) throw mapDatabaseError(error, 'The post could not be loaded.');
  if (!data) {
    throw new PostDataError('NOT_FOUND', 'That post no longer exists.');
  }
  return parseFeedPost(data);
}

export async function getComments(postId: string): Promise<CommentRecord[]> {
  const validPostId = parseUuid(postId, 'Post');
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', validPostId)
    .order('created_at', { ascending: true });

  if (error) throw mapDatabaseError(error, 'Comments could not be loaded.');
  return parseFeedComments(data ?? []);
}

export type SignedPostImage = {
  url: string;
  expiresAt: number;
};

export async function getSignedPostImage(
  imagePath: string,
  expiresInSeconds = POST_IMAGE_URL_TTL_SECONDS,
): Promise<SignedPostImage> {
  if (!imagePath || expiresInSeconds <= 0) {
    throw new PostDataError('INVALID_INPUT', 'The post image request is invalid.');
  }

  const requestedAt = Date.now();
  const { data, error } = await supabase.storage
    .from(POST_IMAGE_BUCKET)
    .createSignedUrl(imagePath, expiresInSeconds);

  if (error) {
    if (String(error.message).toLowerCase().includes('network')) {
      throw mapUploadError(error);
    }
    throw new PostDataError(
      'STORAGE',
      'The private post image could not be opened.',
      { cause: error },
    );
  }

  return {
    url: data.signedUrl,
    expiresAt: requestedAt + expiresInSeconds * 1000,
  };
}

export async function getSignedPostAudio(
  audioPath: string,
  expiresInSeconds = POST_IMAGE_URL_TTL_SECONDS,
): Promise<SignedPostImage> {
  if (!audioPath || expiresInSeconds <= 0) {
    throw new PostDataError('INVALID_INPUT', 'The voice note request is invalid.');
  }

  const requestedAt = Date.now();
  const { data, error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrl(audioPath, expiresInSeconds);

  if (error) {
    if (String(error.message).toLowerCase().includes('network')) {
      throw mapUploadError(error);
    }
    throw new PostDataError(
      'STORAGE',
      'The private voice note could not be opened.',
      { cause: error },
    );
  }

  return {
    url: data.signedUrl,
    expiresAt: requestedAt + expiresInSeconds * 1000,
  };
}

export async function getSignedPostVideo(
  videoPath: string,
  expiresInSeconds = POST_IMAGE_URL_TTL_SECONDS,
): Promise<SignedPostImage> {
  if (!videoPath || expiresInSeconds <= 0) {
    throw new PostDataError('INVALID_INPUT', 'The video request is invalid.');
  }

  const requestedAt = Date.now();
  const { data, error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrl(videoPath, expiresInSeconds);

  if (error) {
    if (String(error.message).toLowerCase().includes('network')) {
      throw mapUploadError(error);
    }
    throw new PostDataError(
      'STORAGE',
      'The private video could not be opened.',
      { cause: error },
    );
  }

  return {
    url: data.signedUrl,
    expiresAt: requestedAt + expiresInSeconds * 1000,
  };
}

export async function createPost(input: CreatePostInput): Promise<PostRecord[]> {
  const parsed = createPostInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PostDataError(
      'INVALID_INPUT',
      parsed.error.issues[0]?.message ?? 'The post details are invalid.',
      { cause: parsed.error },
    );
  }

  const userId = await requireUserId();
  const imageBytes = await preparePostImage(parsed.data.imageUri);
  const audioBytes = parsed.data.audioUri
    ? await preparePostAudio(parsed.data.audioUri)
    : null;
  const videoBytes = parsed.data.videoUri
    ? await preparePostVideo(parsed.data.videoUri)
    : null;
  const videoDurationMs = videoBytes ? parsed.data.videoDurationMs : null;
  const isTemporary = parsed.data.isTemporary;
  const prepared = parsed.data.rideIds.map((rideId) => {
    const postId = Crypto.randomUUID();
    return {
      rideId,
      postId,
      imagePath: buildPostImagePath(rideId, userId, postId),
      audioPath: audioBytes ? buildPostAudioPath(rideId, userId, postId) : null,
      videoPath: videoBytes ? buildPostVideoPath(rideId, userId, postId) : null,
    };
  });

  const uploadedPaths: string[] = [];
  try {
    for (const entry of prepared) {
      const { error: uploadError } = await supabase.storage
        .from(POST_IMAGE_BUCKET)
        .upload(entry.imagePath, imageBytes, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (uploadError) {
        throw mapUploadError(uploadError);
      }
      uploadedPaths.push(entry.imagePath);

      if (audioBytes && entry.audioPath) {
        const { error: audioUploadError } = await supabase.storage
          .from(POST_MEDIA_BUCKET)
          .upload(entry.audioPath, audioBytes, {
            contentType: 'audio/mp4',
            upsert: false,
          });
        if (audioUploadError) {
          throw mapUploadError(audioUploadError);
        }
        uploadedPaths.push(entry.audioPath);
      }

      if (videoBytes && entry.videoPath) {
        const { error: videoUploadError } = await supabase.storage
          .from(POST_MEDIA_BUCKET)
          .upload(entry.videoPath, videoBytes, {
            contentType: 'video/mp4',
            upsert: false,
          });
        if (videoUploadError) {
          throw mapUploadError(videoUploadError);
        }
        uploadedPaths.push(entry.videoPath);
      }
    }

    // DB trigger overwrites expires_at for temps; required by check constraint.
    const expiresAt = isTemporary
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data: inserted, error: insertError } = await supabase
      .from('posts')
      .insert(
        prepared.map((entry) => ({
          id: entry.postId,
          ride_id: entry.rideId,
          user_id: userId,
          image_path: entry.imagePath,
          audio_path: entry.audioPath,
          video_path: entry.videoPath,
          video_duration_ms: entry.videoPath ? videoDurationMs : null,
          description: parsed.data.description,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          location_name: parsed.data.locationName,
          scheduled_date: parsed.data.scheduledDate,
          is_temporary: isTemporary,
          expires_at: expiresAt,
        })),
      )
      .select(POST_SELECT);

    if (insertError) {
      throw mapDatabaseError(insertError, 'The post could not be saved.');
    }

    const posts = parseFeedPosts(inserted ?? []);
    trackPostCreated({
      rideIds: prepared.map((entry) => entry.rideId),
      postCount: posts.length,
      hasAudio: Boolean(audioBytes),
      hasVideo: Boolean(videoBytes),
      isTemporary,
    });
    return posts;
  } catch (error) {
    if (uploadedPaths.length) {
      await supabase.storage.from(POST_MEDIA_BUCKET).remove(uploadedPaths);
    }
    throw error;
  }
}

export async function deletePost(postId: string): Promise<void> {
  const validPostId = parseUuid(postId, 'Post');
  const userId = await requireUserId();

  const { data, error: lookupError } = await supabase
    .from('posts')
    .select('id, user_id, image_path, audio_path, video_path')
    .eq('id', validPostId)
    .eq('user_id', userId)
    .single();
  if (lookupError) {
    throw mapDatabaseError(lookupError, 'The post could not be found.');
  }

  const imagePath = String(data.image_path);
  const audioPath =
    typeof data.audio_path === 'string' && data.audio_path.trim()
      ? data.audio_path
      : null;
  const videoPath =
    typeof data.video_path === 'string' && data.video_path.trim()
      ? data.video_path
      : null;
  const pathsToRemove = [imagePath, audioPath, videoPath].filter(
    (path): path is string => Boolean(path),
  );

  // Remove files first while the caller can still resolve them. storage.remove
  // needs SELECT+DELETE; an empty result usually means RLS blocked the delete.
  const { data: removed, error: storageError } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .remove(pathsToRemove);
  if (storageError) {
    throw new PostDataError(
      'STORAGE',
      'The post media could not be removed, so the post was kept.',
      { cause: storageError },
    );
  }
  if (!removed?.length) {
    const { error: stillExistsError } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrl(imagePath, 60);
    if (!stillExistsError) {
      throw new PostDataError(
        'STORAGE',
        'The post media could not be removed, so the post was kept.',
      );
    }
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('posts')
    .delete()
    .eq('id', validPostId)
    .eq('user_id', userId)
    .select('id');
  if (deleteError) {
    throw mapDatabaseError(deleteError, 'The post media was removed, but its record remains.');
  }
  if (!deleted?.length) {
    throw new PostDataError('NOT_FOUND', 'The post could not be deleted.');
  }
}

/** Removes expired 24h posts (file + row) for the signed-in user. */
export async function purgeExpiredTemporaryPosts(): Promise<void> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('user_id', userId)
    .eq('is_temporary', true)
    .lte('expires_at', new Date().toISOString());
  if (error) {
    throw mapDatabaseError(error, 'Expired photos could not be cleaned up.');
  }

  for (const post of data ?? []) {
    try {
      await deletePost(String(post.id));
    } catch {
      // Keep going so one failure doesn’t block the rest.
    }
  }
}

/**
 * Deletes every object under `{rideId}/` via the Storage API.
 * Requires last-member creator purge policies.
 */
export async function removeRidePostFiles(rideId: string): Promise<void> {
  const validRideId = parseUuid(rideId, 'Ride');
  const { data: userFolders, error: listError } = await supabase.storage
    .from(POST_IMAGE_BUCKET)
    .list(validRideId, { limit: 1000 });
  if (listError) {
    throw new PostDataError(
      'STORAGE',
      'Ride photos could not be removed from storage.',
      { cause: listError },
    );
  }

  const paths: string[] = [];
  for (const folder of userFolders ?? []) {
    if (!folder.name || folder.name.startsWith('.')) continue;
    const prefix = `${validRideId}/${folder.name}`;
    const { data: files, error: filesError } = await supabase.storage
      .from(POST_IMAGE_BUCKET)
      .list(prefix, { limit: 1000 });
    if (filesError) {
      throw new PostDataError(
        'STORAGE',
        'Ride photos could not be removed from storage.',
        { cause: filesError },
      );
    }
    for (const file of files ?? []) {
      if (!file.name || file.name.startsWith('.')) continue;
      paths.push(`${prefix}/${file.name}`);
    }
  }

  if (!paths.length) return;

  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const { error: removeError } = await supabase.storage
      .from(POST_IMAGE_BUCKET)
      .remove(chunk);
    if (removeError) {
      throw new PostDataError(
        'STORAGE',
        'Ride photos could not be removed from storage.',
        { cause: removeError },
      );
    }
  }
}

export async function createComment(
  input: CreateCommentInput,
): Promise<CommentRecord> {
  const parsed = createCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PostDataError(
      'INVALID_INPUT',
      parsed.error.issues[0]?.message ?? 'The comment is invalid.',
      { cause: parsed.error },
    );
  }

  await requireUserId();
  const mentionedUserIds = [...new Set(parsed.data.mentionedUserIds ?? [])];
  const { data: commentId, error: createError } = await supabase.rpc(
    'create_comment_with_mentions',
    {
      p_post_id: parsed.data.postId,
      p_content: parsed.data.content,
      p_mentioned_user_ids: mentionedUserIds,
    },
  );

  if (createError) {
    throw mapDatabaseError(createError, 'The comment could not be posted.');
  }

  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('id', String(commentId))
    .single();

  if (error) throw mapDatabaseError(error, 'The comment could not be posted.');
  const comment = parseFeedComments([data])[0]!;
  trackCommentCreated(parsed.data.postId, comment.id);
  return comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  const validCommentId = parseUuid(commentId, 'Comment');
  const userId = await requireUserId();
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', validCommentId)
    .eq('user_id', userId);

  if (error) throw mapDatabaseError(error, 'The comment could not be deleted.');
}

export async function getReactions(postId: string): Promise<ReactionRecord[]> {
  const validPostId = parseUuid(postId, 'Post');
  const { data, error } = await supabase
    .from('post_reactions')
    .select(REACTION_SELECT)
    .eq('post_id', validPostId)
    .order('created_at', { ascending: true });

  if (!error) return parseFeedReactions(data ?? []);

  if (!isMissingRelationshipError(error)) {
    throw mapDatabaseError(error, 'Reactions could not be loaded.');
  }

  const { data: rows, error: plainError } = await supabase
    .from('post_reactions')
    .select(REACTION_SELECT_PLAIN)
    .eq('post_id', validPostId)
    .order('created_at', { ascending: true });
  if (plainError) {
    throw mapDatabaseError(plainError, 'Reactions could not be loaded.');
  }
  return parseFeedReactions(
    (rows ?? []).map((row) => ({ ...row, profile: null })),
  );
}

export async function upsertReaction(
  input: UpsertReactionInput,
): Promise<ReactionRecord> {
  const parsed = upsertReactionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PostDataError(
      'INVALID_INPUT',
      parsed.error.issues[0]?.message ?? 'The reaction is invalid.',
      { cause: parsed.error },
    );
  }
  if (!isValidReactionScore(parsed.data.score)) {
    throw new PostDataError('INVALID_INPUT', 'That reaction is not available.');
  }

  const userId = await requireUserId();
  const postId = parsed.data.postId;
  const score = parsed.data.score;

  // Prefer update-or-insert over upsert: column-level UPDATE grants only cover
  // `score`, and PostgREST upserts try to rewrite the conflict columns too.
  const { data: existing, error: lookupError } = await supabase
    .from('post_reactions')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError) {
    throw mapDatabaseError(lookupError, 'The reaction could not be saved.');
  }

  if (existing?.id) {
    const { error } = await supabase
      .from('post_reactions')
      .update({ score })
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (error) throw mapDatabaseError(error, 'The reaction could not be saved.');
    return selectReactionRow({ id: existing.id });
  }

  const { data: inserted, error } = await supabase
    .from('post_reactions')
    .insert({
      post_id: postId,
      user_id: userId,
      score,
    })
    .select('id')
    .single();

  if (error) {
    // Race: another request inserted first — fall back to update.
    if (errorLikeCode(error) === '23505') {
      const { error: updateError } = await supabase
        .from('post_reactions')
        .update({ score })
        .eq('post_id', postId)
        .eq('user_id', userId);
      if (updateError) {
        throw mapDatabaseError(updateError, 'The reaction could not be saved.');
      }
      return selectReactionRow({ postId, userId });
    }
    throw mapDatabaseError(error, 'The reaction could not be saved.');
  }
  return selectReactionRow({ id: String(inserted.id) });
}

function errorLikeCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code ?? '');
  }
  return '';
}

export async function removeReaction(
  input: RemoveReactionInput,
): Promise<void> {
  const parsed = removeReactionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PostDataError(
      'INVALID_INPUT',
      parsed.error.issues[0]?.message ?? 'The reaction request is invalid.',
      { cause: parsed.error },
    );
  }

  const userId = await requireUserId();
  const { error } = await supabase
    .from('post_reactions')
    .delete()
    .eq('post_id', parsed.data.postId)
    .eq('user_id', userId);

  if (error) throw mapDatabaseError(error, 'The reaction could not be removed.');
}
