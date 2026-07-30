import { File } from 'expo-file-system';
import { compress } from 'expo-image-and-video-compressor';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { PostDataError } from './errors';
import { cropImageToPostAspect } from './image';
import { deleteLocalMediaFile } from './local-media';
import {
  POST_VIDEO_MAX_BYTES,
  POST_VIDEO_MAX_LONG_EDGE,
  POST_VIDEO_TARGET_BITRATE,
} from './utils';

/**
 * Hard-compress a clip for upload: H.264 (universal iOS/Android playback),
 * 720p long edge, ~0.8 Mbps. Hardware-accelerated on both platforms.
 */
export async function compressPostVideo(videoUri: string): Promise<string> {
  try {
    return await compress(videoUri, {
      bitrate: POST_VIDEO_TARGET_BITRATE,
      maxSize: POST_VIDEO_MAX_LONG_EDGE,
      codec: 'h264',
      // Prefer size over speed — clips are ≤15s so encode time stays short.
      speed: 'balanced',
    });
  } catch (error) {
    throw new PostDataError(
      'IMAGE_PROCESSING',
      'The video could not be compressed. Try recording again.',
      { cause: error },
    );
  }
}

/** Compress then read bytes for storage upload. */
export async function preparePostVideo(videoUri: string): Promise<ArrayBuffer> {
  let compressedUri: string | null = null;
  try {
    compressedUri = await compressPostVideo(videoUri);
    const file = new File(compressedUri);
    if (!file.exists) {
      throw new PostDataError('INVALID_INPUT', 'The compressed video file is missing.');
    }
    const bytes = await file.bytes();
    if (bytes.byteLength > POST_VIDEO_MAX_BYTES) {
      throw new PostDataError(
        'INVALID_INPUT',
        'That video is still too large after compression. Try a shorter clip.',
      );
    }
    return bytes.buffer;
  } catch (error) {
    if (error instanceof PostDataError) throw error;
    throw new PostDataError(
      'IMAGE_PROCESSING',
      'The video could not be prepared. Try recording again.',
      { cause: error },
    );
  } finally {
    // Drop the compressed copy; the original draft is cleaned up by publish/retake.
    if (compressedUri && compressedUri !== videoUri) {
      try {
        const file = new File(compressedUri);
        if (file.exists) file.delete();
      } catch {
        // Cache cleanup must not hide upload results.
      }
    }
  }
}

/**
 * Grabs the first frame of a video as the post's cover/thumbnail, cropped to
 * the same 3∶4 frame every photo post uses (`image_path` doubles as the
 * thumbnail for video posts so the feed never special-cases the cover).
 */
export async function generatePostVideoThumbnail(videoUri: string): Promise<string> {
  let rawThumbUri: string | null = null;
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 0,
      quality: 0.9,
    });
    rawThumbUri = uri;
    const cropped = await cropImageToPostAspect(uri);
    if (cropped !== uri) deleteLocalMediaFile(uri);
    return cropped;
  } catch (error) {
    deleteLocalMediaFile(rawThumbUri);
    throw new PostDataError(
      'IMAGE_PROCESSING',
      'A thumbnail could not be created from the video. Try again.',
      { cause: error },
    );
  }
}
