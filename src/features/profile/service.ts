import { supabase } from '@/lib/supabase';

import { ProfileDataError } from './errors';
import { AVATAR_BUCKET, buildAvatarPath, prepareAvatarImage } from './image';

function mapStorageError(error: { message?: string } | null, fallback: string) {
  if (!error) return new ProfileDataError('STORAGE', fallback);
  return new ProfileDataError('STORAGE', fallback, { cause: error });
}

export async function uploadAvatar(userId: string, imageUri: string): Promise<string> {
  const path = buildAvatarPath(userId);
  const bytes = await prepareAvatarImage(imageUri);

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (uploadError) {
    throw mapStorageError(uploadError, 'The profile photo could not be uploaded.');
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);

  if (updateError) {
    throw new ProfileDataError(
      'PROFILE_UPDATE',
      'The photo uploaded, but your profile could not be updated.',
      { cause: updateError },
    );
  }

  return avatarUrl;
}

export async function removeAvatar(userId: string): Promise<void> {
  const path = buildAvatarPath(userId);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId);

  if (updateError) {
    throw new ProfileDataError(
      'PROFILE_UPDATE',
      'The profile photo could not be removed.',
      { cause: updateError },
    );
  }

  await supabase.storage.from(AVATAR_BUCKET).remove([path]);
}
