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
  location_name, scheduled_date, created_at, updated_at,
  profile:profiles!posts_user_id_fkey(id, username, display_name, avatar_url),
  comments(count)
`;

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

export async function getRideFeed(rideId: string): Promise<PostRecord[]> {
  const validRideId = parseUuid(rideId, 'Ride');
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('ride_id', validRideId)
    .order('created_at', { ascending: false });

  if (error) throw mapDatabaseError(error, 'The Ride feed could not be loaded.');
  return parseFeedPosts(data ?? []);
}

export async function getPost(postId: string): Promise<PostRecord> {
  const validPostId = parseUuid(postId, 'Post');
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', validPostId)
    .single();

  if (error) throw mapDatabaseError(error, 'The post could not be loaded.');
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
  const { error: storageError } = await supabase.storage
    .from(POST_IMAGE_BUCKET)
    .remove([imagePath]);
  if (storageError) {
    throw new PostDataError(
      'STORAGE',
      'The post image could not be removed, so the post was kept.',
      { cause: storageError },
    );
  }

  const { error: deleteError } = await supabase
    .from('posts')
    .delete()
    .eq('id', validPostId)
    .eq('user_id', userId);
  if (deleteError) {
    throw mapDatabaseError(deleteError, 'The post image was removed, but its record remains.');
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
