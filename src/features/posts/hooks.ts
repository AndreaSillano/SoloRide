import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import { queryKeys } from '@/lib/queryKeys';

import type { CreateCommentInput, CreatePostInput } from './schemas';
import {
  createComment,
  createPost,
  deleteComment,
  deletePost,
  getComments,
  getPost,
  getRideFeedPage,
  getSignedPostImage,
} from './service';
import {
  POST_IMAGE_URL_EXPIRY_SAFETY_MS,
  POST_IMAGE_URL_TTL_SECONDS,
} from './utils';

/** Only request the next page when the user is this close to the bottom. */
const FEED_LOAD_MORE_THRESHOLD_PX = 180;

export function useRideFeed(rideId: string | null | undefined) {
  const { user } = useCurrentUser();
  const query = useInfiniteQuery({
    queryKey: queryKeys.ridePosts(rideId ?? ''),
    queryFn: ({ pageParam }) => getRideFeedPage(rideId ?? '', pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(rideId && user?.id),
  });

  const posts = useMemo(
    () => query.data?.pages.flatMap((page) => page.posts) ?? [],
    [query.data],
  );

  // Prevents chaining page fetches while images are still measuring and the
  // viewport stays "near the bottom" — older posts should just append once.
  const lockedUntilContentHeight = useRef(0);
  const lastOffsetY = useRef(0);

  useEffect(() => {
    lockedUntilContentHeight.current = 0;
    lastOffsetY.current = 0;
  }, [rideId]);

  const loadMoreIfNearEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const scrollingDown = contentOffset.y >= lastOffsetY.current;
    lastOffsetY.current = contentOffset.y;
    if (!scrollingDown) return;
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    // Wait until the previous page has actually lengthened the feed.
    if (contentSize.height <= lockedUntilContentHeight.current) return;

    const distanceFromEnd =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (distanceFromEnd > FEED_LOAD_MORE_THRESHOLD_PX) return;

    lockedUntilContentHeight.current = contentSize.height;
    void query.fetchNextPage().then((result) => {
      if (result.isError) lockedUntilContentHeight.current = 0;
    });
  };

  return {
    ...query,
    /** Flattened posts across loaded pages (newest first). */
    data: posts,
    loadMoreIfNearEnd,
  };
}

export function usePost(postId: string | null | undefined) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.post(postId ?? ''),
    queryFn: () => getPost(postId ?? ''),
    enabled: Boolean(postId && user?.id),
  });
}

export function useComments(postId: string | null | undefined) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.comments(postId ?? ''),
    queryFn: () => getComments(postId ?? ''),
    enabled: Boolean(postId && user?.id),
  });
}

export function useSignedPostImage(imagePath: string | null | undefined) {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: ['post-image', imagePath ?? ''] as const,
    queryFn: () => getSignedPostImage(imagePath ?? ''),
    enabled: Boolean(imagePath && user?.id),
    staleTime:
      POST_IMAGE_URL_TTL_SECONDS * 1000 - POST_IMAGE_URL_EXPIRY_SAFETY_MS,
    gcTime: POST_IMAGE_URL_TTL_SECONDS * 1000,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => createPost(input),
    onSuccess: (post) => {
      queryClient.setQueryData(queryKeys.post(post.id), post);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ridePosts(post.ride_id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.postedStatus(
          post.ride_id,
          post.user_id,
          post.scheduled_date,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: ['week-posted-status', post.ride_id],
      });
      void queryClient.invalidateQueries({ queryKey: ['rides-due-today'] });
    },
  });
}

type DeletePostVariables = {
  postId: string;
  rideId: string;
};

export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId }: DeletePostVariables) => deletePost(postId),
    onSuccess: (_, variables) => {
      queryClient.removeQueries({ queryKey: queryKeys.post(variables.postId) });
      queryClient.removeQueries({
        queryKey: queryKeys.comments(variables.postId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ridePosts(variables.rideId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['posted-status', variables.rideId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['week-posted-status', variables.rideId],
      });
      void queryClient.invalidateQueries({ queryKey: ['rides-due-today'] });
    },
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) => createComment(input),
    onSuccess: (comment, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.comments(comment.post_id),
      });
      // Keeps the feed's "View N comments" count in sync. The `comments`
      // table has no ride_id column, so we rely on the mutation input.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ridePosts(variables.rideId),
      });
    },
  });
}

type DeleteCommentVariables = {
  commentId: string;
  postId: string;
  rideId: string;
};

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: DeleteCommentVariables) =>
      deleteComment(commentId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.comments(variables.postId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ridePosts(variables.rideId),
      });
    },
  });
}
