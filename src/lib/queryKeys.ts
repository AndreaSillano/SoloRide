export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  rides: (userId: string) => ['rides', userId] as const,
  ride: (rideId: string) => ['ride', rideId] as const,
  rideMembers: (rideId: string) => ['ride-members', rideId] as const,
  ridePosts: (rideId: string) => ['ride-posts', rideId] as const,
  post: (postId: string) => ['post', postId] as const,
  comments: (postId: string) => ['comments', postId] as const,
  reactions: (postId: string) => ['reactions', postId] as const,
  postedStatus: (rideId: string, userId: string, scheduledDate: string) =>
    ['posted-status', rideId, userId, scheduledDate] as const,
  weekPostedStatus: (rideId: string, userId: string, weekStart: string, weekEnd: string) =>
    ['week-posted-status', rideId, userId, weekStart, weekEnd] as const,
};
