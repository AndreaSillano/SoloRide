export type ChallengeCatalogItem = {
  id: string;
  title: string;
  description: string;
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
  /** Set when the challenge closes early (all members posted). */
  winner_user_id: string | null;
  created_at: string;
  challenge: Pick<ChallengeCatalogItem, 'id' | 'title' | 'description'> | null;
  completers: RideChallengeCompleter[];
  current_user_completed: boolean;
};

export type OpenRideChallengeInput = {
  rideId: string;
  challengeId?: string | null;
};
