import { File } from 'expo-file-system';

/**
 * Best-effort delete for app-local drafts (camera / cache / tmp).
 * Skips non-file URIs (photo-library assets, content://, remote URLs).
 */
export function deleteLocalMediaFile(uri: string | null | undefined) {
  if (!uri || !uri.startsWith('file:')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must never surface to the user.
  }
}

export function deleteLocalMediaFiles(
  ...uris: Array<string | null | undefined>
) {
  for (const uri of uris) deleteLocalMediaFile(uri);
}
