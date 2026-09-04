import { supabase } from '@/lib/supabase';

import type {
  ChallengeCatalogItem,
  OpenRideChallengeInput,
  RideChallenge,
  RideChallengeCompleter,
} from './types';

const CHALLENGE_EMBED =
  'id,title,description';

const RIDE_CHALLENGE_SELECT = `
  id,ride_id,challenge_id,starts_at,ends_at,source,opened_by_user_id,winner_user_id,created_at,
  challenge:challenges!ride_challenges_challenge_id_fkey(${CHALLENGE_EMBED})
`;

type ChallengeEmbed = RideChallenge['challenge'] | RideChallenge['challenge'][];

type RideChallengeRow = Omit<RideChallenge, 'challenge' | 'completers' | 'current_user_completed'> & {
  challenge: ChallengeEmbed;
};

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message) return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '');
    if (message) return new Error(message);
  }
  return new Error(fallback);
}

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw mapError(error, 'We could not verify your account.');
  if (!data.user) throw new Error('Sign in to continue.');
  return data.user.id;
}

async function attachCompleters(
  rows: RideChallengeRow[],
  userId: string,
): Promise<RideChallenge[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const { data: posts, error } = await supabase
    .from('posts')
    .select(
      `
      ride_challenge_id,user_id,
      profile:profiles!posts_user_id_fkey(id,username,display_name,avatar_url)
    `,
    )
    .in('ride_challenge_id', ids);

  if (error) throw mapError(error, 'Challenge completions could not be loaded.');

  const byChallenge = new Map<string, RideChallengeCompleter[]>();
  const completedIds = new Set<string>();

  for (const post of posts ?? []) {
    const challengeId = String(post.ride_challenge_id ?? '');
    if (!challengeId) continue;
    if (post.user_id === userId) completedIds.add(challengeId);

    const profile = firstOrSelf(
      post.profile as RideChallengeCompleter | RideChallengeCompleter[] | null,
    );
    if (!profile) continue;

    const list = byChallenge.get(challengeId) ?? [];
    if (!list.some((entry) => entry.id === profile.id)) {
      list.push(profile);
      byChallenge.set(challengeId, list);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    ride_id: row.ride_id,
    challenge_id: row.challenge_id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    source: row.source,
    opened_by_user_id: row.opened_by_user_id,
    winner_user_id: row.winner_user_id ?? null,
    created_at: row.created_at,
    challenge: firstOrSelf(row.challenge),
    completers: byChallenge.get(row.id) ?? [],
    current_user_completed: completedIds.has(row.id),
  }));
}

export async function fetchChallengeCatalog(): Promise<ChallengeCatalogItem[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id,title,description,duration,is_active,created_at,updated_at')
    .eq('is_active', true)
    .order('title', { ascending: true });

  if (error) throw mapError(error, 'Challenges could not be loaded.');
  return (data ?? []) as ChallengeCatalogItem[];
}

export async function fetchActiveRideChallenge(
  rideId: string,
): Promise<RideChallenge | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('ride_challenges')
    .select(RIDE_CHALLENGE_SELECT)
    .eq('ride_id', rideId)
    .gt('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw mapError(error, 'The active challenge could not be loaded.');
  if (!data) return null;

  const [mapped] = await attachCompleters([data as RideChallengeRow], userId);
  return mapped ?? null;
}

export async function fetchRideChallengeHistory(
  rideId: string,
): Promise<RideChallenge[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('ride_challenges')
    .select(RIDE_CHALLENGE_SELECT)
    .eq('ride_id', rideId)
    .order('starts_at', { ascending: false });

  if (error) throw mapError(error, 'Challenge history could not be loaded.');
  return attachCompleters((data ?? []) as RideChallengeRow[], userId);
}

export async function fetchRideChallenge(
  rideChallengeId: string,
): Promise<RideChallenge | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('ride_challenges')
    .select(RIDE_CHALLENGE_SELECT)
    .eq('id', rideChallengeId)
    .maybeSingle();

  if (error) throw mapError(error, 'The challenge could not be loaded.');
  if (!data) return null;

  const [mapped] = await attachCompleters([data as RideChallengeRow], userId);
  return mapped ?? null;
}

export async function openRideChallenge(
  input: OpenRideChallengeInput,
): Promise<RideChallenge> {
  const userId = await requireUserId();
  const { data, error } = await supabase.rpc('open_ride_challenge', {
    p_ride_id: input.rideId,
    p_challenge_id: input.challengeId ?? null,
  });

  if (error) throw mapError(error, 'The challenge could not be opened.');

  const row = data as RideChallengeRow | RideChallengeRow[] | null;
  const opened = firstOrSelf(Array.isArray(row) ? row : row ? [row] : []);
  if (!opened) throw new Error('The challenge could not be opened.');

  // RPC returns the table row without embed — re-fetch for UI.
  const full = await fetchRideChallenge(opened.id);
  if (!full) {
    return {
      ...opened,
      challenge: null,
      completers: [],
      current_user_completed: false,
      winner_user_id: opened.winner_user_id ?? null,
      opened_by_user_id: opened.opened_by_user_id ?? userId,
    };
  }
  return full;
}
