import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

import {
  mapDatabaseError,
  mapUploadError,
  PostDataError,
} from './errors';
import { preparePostImage } from './image';
import {
  commentSchema,
  createCommentInputSchema,
  createPostInputSchema,
  type CommentRecord,
  type CreateCommentInput,
  type CreatePostInput,
  type PostRecord,
  postSchema,
  uuidSchema,
} from './schemas';
import {
  buildPostImagePath,
  POST_IMAGE_BUCKET,
  POST_IMAGE_URL_TTL_SECONDS,
} from './utils';

const POST_SELECT = `
  id, ride_id, user_id, image_path, description, latitude, longitude,
  location_name, scheduled_date, is_temporary, expires_at, created_at, updated_at,
  profile:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
  comments(count)
`;

/** Hide expired temporary posts until cleanup deletes them. */
function activeFeedFilter() {
  return `is_temporary.eq.false,expires_at.gt.${new Date().toISOString()}`;
}

const COMMENT_SELECT = `
  id, post_id, user_id, content, created_at, updated_at,
  profile:profiles!comments_user_id_fkey(id, username, display_name, avatar_url)
`;

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

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw mapDatabaseError(error, 'We could not verify your account.');
  if (!data.user) {
    throw new PostDataError('AUTH_REQUIRED', 'Sign in to continue.');
  }
  return data.user.id;
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

export async function createPost(input: CreatePostInput): Promise<PostRecord> {
  const parsed = createPostInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PostDataError(
      'INVALID_INPUT',
      parsed.error.issues[0]?.message ?? 'The post details are invalid.',
      { cause: parsed.error },
    );
  }

  const userId = await requireUserId();
  const postId = Crypto.randomUUID();
  const imagePath = buildPostImagePath(parsed.data.rideId, userId, postId);
  const imageBytes = await preparePostImage(parsed.data.imageUri);

  const { error: uploadError } = await supabase.storage
    .from(POST_IMAGE_BUCKET)
    .upload(imagePath, imageBytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    // An upload can succeed server-side even if its response is interrupted.
    await supabase.storage.from(POST_IMAGE_BUCKET).remove([imagePath]);
    throw mapUploadError(uploadError);
  }

  const isTemporary = parsed.data.isTemporary;
  const { data: inserted, error: insertError } = await supabase
    .from('posts')
    .insert({
      id: postId,
      ride_id: parsed.data.rideId,
      user_id: userId,
      image_path: imagePath,
      description: parsed.data.description,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      location_name: parsed.data.locationName,
      scheduled_date: parsed.data.scheduledDate,
      is_temporary: isTemporary,
      // DB trigger overwrites this for temps; required by check constraint.
      expires_at: isTemporary
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null,
    })
    .select(POST_SELECT)
    .single();

  if (insertError) {
    await supabase.storage.from(POST_IMAGE_BUCKET).remove([imagePath]);
    throw mapDatabaseError(insertError, 'The post could not be saved.');
  }

  return parseFeedPost(inserted);
}

export async function deletePost(postId: string): Promise<void> {
  const validPostId = parseUuid(postId, 'Post');
  const userId = await requireUserId();

  const { data, error: lookupError } = await supabase
    .from('posts')
    .select('id, user_id, image_path')
    .eq('id', validPostId)
    .eq('user_id', userId)
    .single();
  if (lookupError) {
    throw mapDatabaseError(lookupError, 'The post could not be found.');
  }

  const imagePath = String(data.image_path);

  // Remove the file first while the caller can still resolve it. storage.remove
  // needs SELECT+DELETE; an empty result usually means RLS blocked the delete.
  const { data: removed, error: storageError } = await supabase.storage
    .from(POST_IMAGE_BUCKET)
    .remove([imagePath]);
  if (storageError) {
    throw new PostDataError(
      'STORAGE',
      'The post image could not be removed, so the post was kept.',
      { cause: storageError },
    );
  }
  if (!removed?.length) {
    const { error: stillExistsError } = await supabase.storage
      .from(POST_IMAGE_BUCKET)
      .createSignedUrl(imagePath, 60);
    if (!stillExistsError) {
      throw new PostDataError(
        'STORAGE',
        'The post image could not be removed, so the post was kept.',
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
    throw mapDatabaseError(deleteError, 'The post image was removed, but its record remains.');
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

  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: parsed.data.postId,
      user_id: userId,
      content: parsed.data.content,
    })
    .select(COMMENT_SELECT)
    .single();

  if (error) throw mapDatabaseError(error, 'The comment could not be posted.');
  return parseFeedComments([data])[0]!;
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
