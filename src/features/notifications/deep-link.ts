import { useSyncExternalStore } from 'react';

export type CommentDeepLink = {
  rideId: string;
  postId: string;
  key: string;
};

let pendingCommentDeepLink: CommentDeepLink | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Queue a comment/mention push target for Home to open. */
export function queueCommentDeepLink(input: { rideId: string; postId: string }) {
  pendingCommentDeepLink = {
    rideId: input.rideId,
    postId: input.postId,
    key: `${input.postId}:${Date.now()}`,
  };
  emit();
}

export function clearCommentDeepLink() {
  if (!pendingCommentDeepLink) return;
  pendingCommentDeepLink = null;
  emit();
}

export function getCommentDeepLink() {
  return pendingCommentDeepLink;
}

export function subscribeCommentDeepLink(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCommentDeepLink() {
  return useSyncExternalStore(
    subscribeCommentDeepLink,
    getCommentDeepLink,
    getCommentDeepLink,
  );
}
