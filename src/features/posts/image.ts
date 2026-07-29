import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { PostDataError } from './errors';
import {
  getResizeDimensions,
  POST_IMAGE_JPEG_QUALITY,
} from './utils';

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
