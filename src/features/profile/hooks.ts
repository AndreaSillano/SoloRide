import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/auth/auth-context';

import { removeAvatar, uploadAvatar } from './service';

export function useUpdateAvatar() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (imageUri: string) => {
      if (!user?.id) throw new Error('You must be signed in to update your photo.');
      return uploadAvatar(user.id, imageUri);
    },
    onSuccess: async () => {
      await refreshProfile();
      void queryClient.invalidateQueries({ queryKey: ['ride-posts'] });
      void queryClient.invalidateQueries({ queryKey: ['comments'] });
      void queryClient.invalidateQueries({ queryKey: ['ride-members'] });
    },
  });
}

export function useRemoveAvatar() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('You must be signed in to remove your photo.');
      await removeAvatar(user.id);
    },
    onSuccess: async () => {
      await refreshProfile();
      void queryClient.invalidateQueries({ queryKey: ['ride-posts'] });
      void queryClient.invalidateQueries({ queryKey: ['comments'] });
      void queryClient.invalidateQueries({ queryKey: ['ride-members'] });
    },
  });
}
