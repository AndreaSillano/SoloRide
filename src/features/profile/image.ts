import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { getResizeDimensions } from '@/features/posts/utils';

import { ProfileDataError } from './errors';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_LONG_EDGE = 512;
export const AVATAR_JPEG_QUALITY = 0.82;

export function buildAvatarPath(userId: string) {
  return `${userId}/avatar.jpg`;
}

export async function prepareAvatarImage(imageUri: string): Promise<ArrayBuffer> {
  let outputFile: File | null = null;

  try {
    const context = ImageManipulator.manipulate(imageUri);
    const source = await context.renderAsync();
    const dimensions = getResizeDimensions(
      source.width,
      source.height,
      AVATAR_MAX_LONG_EDGE,
    );

    if (dimensions) context.resize(dimensions);

    const rendered = dimensions ? await context.renderAsync() : source;
    const result = await rendered.saveAsync({
      compress: AVATAR_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });

    outputFile = new File(result.uri);
    const bytes = await outputFile.bytes();
    return bytes.buffer;
  } catch (error) {
    throw new ProfileDataError(
      'IMAGE_PROCESSING',
      'The selected image could not be prepared. Try a different image.',
      { cause: error },
    );
  } finally {
    if (outputFile?.exists) {
      try {
        outputFile.delete();
      } catch {
        // Cache cleanup must not hide a successful conversion.
      }
    }
  }
}
