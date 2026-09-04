export type ChallengeCatalogItem = {
  id: string;
  title: string;
  description: string;
  /** Postgres interval string, e.g. "24:00:00" or "1 day". */
  duration: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RideChallengeCompleter = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type RideChallenge = {
  id: string;
  ride_id: string;
  challenge_id: string;
  starts_at: string;
  ends_at: string;
  source: 'auto' | 'manual';
  opened_by_user_id: string | null;
  /** Elected after the 1h post-close reaction window (metrics). */
  winner_user_id: string | null;
  /** Winning post at election time (null if deleted). */
  winner_post_id: string | null;
  /** When the winner was frozen (locks likes/comments). */
  winner_declared_at: string | null;
  created_at: string;
  challenge: Pick<ChallengeCatalogItem, 'id' | 'title' | 'description'> | null;
  completers: RideChallengeCompleter[];
  current_user_completed: boolean;
};

export type OpenRideChallengeInput = {
  rideId: string;
  challengeId?: string | null;
};
