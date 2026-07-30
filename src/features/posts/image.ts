import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { PostDataError } from './errors';
import {
  getCenterCropRect,
  getResizeDimensions,
  POST_IMAGE_ASPECT_RATIO,
  POST_IMAGE_JPEG_QUALITY,
} from './utils';

/** Crop to the post frame (3∶4) so feed display never needs to crop. */
export async function cropImageToPostAspect(imageUri: string): Promise<string> {
  try {
    const probe = ImageManipulator.manipulate(imageUri);
    const source = await probe.renderAsync();
    const crop = getCenterCropRect(source.width, source.height, POST_IMAGE_ASPECT_RATIO);
    const alreadyFramed =
      crop.originX === 0 &&
      crop.originY === 0 &&
      crop.width === source.width &&
      crop.height === source.height;
    if (alreadyFramed) {
      return imageUri;
    }

    const context = ImageManipulator.manipulate(imageUri);
    context.crop(crop);
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      compress: POST_IMAGE_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  } catch (error) {
    throw new PostDataError(
      'IMAGE_PROCESSING',
      'The photo could not be cropped to the post frame. Try again.',
      { cause: error },
    );
  }
}

export async function preparePostImage(imageUri: string): Promise<ArrayBuffer> {
  let outputFile: File | null = null;

  try {
    const context = ImageManipulator.manipulate(imageUri);
    const source = await context.renderAsync();
    const dimensions = getResizeDimensions(source.width, source.height);

    if (dimensions) context.resize(dimensions);

    const rendered = dimensions ? await context.renderAsync() : source;
    const result = await rendered.saveAsync({
      compress: POST_IMAGE_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });

    outputFile = new File(result.uri);
    const bytes = await outputFile.bytes();
    return bytes.buffer;
  } catch (error) {
    throw new PostDataError(
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
