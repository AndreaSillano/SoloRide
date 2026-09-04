export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  rides: (userId: string) => ['rides', userId] as const,
  ride: (rideId: string) => ['ride', rideId] as const,
  rideMembers: (rideId: string) => ['ride-members', rideId] as const,
  rideMemberSummaries: (userId: string) => ['ride-member-summaries', userId] as const,
  rideJoinRequests: (rideId: string) => ['ride-join-requests', rideId] as const,
  myPendingJoinRequests: (userId: string) => ['my-pending-join-requests', userId] as const,
  ridePosts: (rideId: string) => ['ride-posts', rideId] as const,
  ridePostDates: (rideId: string, monthKey: string) =>
    ['ride-post-dates', rideId, monthKey] as const,
  ridePostsForDate: (rideId: string, scheduledDate: string) =>
    ['ride-posts-for-date', rideId, scheduledDate] as const,
  post: (postId: string) => ['post', postId] as const,
  comments: (postId: string) => ['comments', postId] as const,
  reactions: (postId: string) => ['reactions', postId] as const,
  postedStatus: (rideId: string, userId: string, scheduledDate: string) =>
    ['posted-status', rideId, userId, scheduledDate] as const,
  weekPostedStatus: (rideId: string, userId: string, weekStart: string, weekEnd: string) =>
    ['week-posted-status', rideId, userId, weekStart, weekEnd] as const,
  challengeCatalog: () => ['challenge-catalog'] as const,
  activeRideChallenge: (rideId: string) => ['active-ride-challenge', rideId] as const,
  rideChallengeHistory: (rideId: string) => ['ride-challenge-history', rideId] as const,
  rideChallenge: (rideChallengeId: string) => ['ride-challenge', rideChallengeId] as const,
  challengePosts: (rideChallengeId: string) => ['challenge-posts', rideChallengeId] as const,
  unlockedRideChallenges: (rideId: string) =>
    ['unlocked-ride-challenges', rideId] as const,
  cadenceUnlockedThrough: (rideId: string) =>
    ['cadence-unlocked-through', rideId] as const,
};
