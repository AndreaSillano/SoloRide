import {
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';

import { PostDataError } from './errors';

/**
 * Lean AAC for ≤30s voice notes (~48 kbps mono).
 * Stays `.m4a` / `audio/mp4` for the ride-posts bucket.
 * ~30s ≈ 180KB vs ~480KB+ at HIGH_QUALITY stereo.
 */
export const VOICE_NOTE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 48_000,
  isMeteringEnabled: false,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 48_000,
  },
};

/** Read a local recording (m4a) into bytes for storage upload. */
export async function preparePostAudio(audioUri: string): Promise<ArrayBuffer> {
  try {
    const file = new File(audioUri);
    if (!file.exists) {
      throw new PostDataError('INVALID_INPUT', 'The voice note file is missing.');
    }
    const bytes = await file.bytes();
    return bytes.buffer;
  } catch (error) {
    if (error instanceof PostDataError) throw error;
    throw new PostDataError(
      'IMAGE_PROCESSING',
      'The voice note could not be prepared. Try recording again.',
      { cause: error },
    );
  }
}
