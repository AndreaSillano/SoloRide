import { format } from 'date-fns';

import { removeRidePostFiles } from '@/features/posts/service';
import {
  trackRideCreated,
  trackRideJoined,
  trackRideJoinRequested,
} from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import { DATE_FORMAT } from '@/utils/schedule';

import { mapRideError, RideProductError } from './errors';
import { rideCodeSchema, rideFormSchema } from './schema';
import type {
  CreateRideInput,
  MyPendingJoinRequest,
  PostedTodayStatus,
  Ride,
  RideJoinRequest,
  RideMember,
  RideMemberSummary,
  RidePreview,
  RidePreviewDetails,
  RidePreviewStatus,
  RideRole,
  RideScheduleDay,
  ScheduleKind,
  UpdateRideInput,
  UserRide,
} from './types';
import { isScheduleKind } from '../../utils/schedule';

const RIDE_COLUMNS =
  'id,name,description,code,creator_id,start_date,end_date,notification_time,strict_schedule,schedule_kind,month_day,weekday_ordinal,challenges_enabled,is_archived,archived_at,created_at,updated_at';

type UserRideRecord = {
  role: RideRole;
  ride: Ride | Ride[] | null;
};

type RideMemberRecord = Omit<RideMember, 'profile'> & {
  profile: RideMember['profile'] | RideMember['profile'][] | null;
};

type RideJoinRequestRecord = Omit<RideJoinRequest, 'profile'> & {
  profile: RideJoinRequest['profile'] | RideJoinRequest['profile'][] | null;
};

type PreviewRecord = Partial<RidePreviewDetails> & {
  status?: unknown;
};

function firstOrSelf<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeRide(ride: Ride): Ride {
  const scheduleKind: ScheduleKind = isScheduleKind(ride.schedule_kind)
    ? ride.schedule_kind
    : 'weekly';
  return {
    ...ride,
    schedule_kind: scheduleKind,
    month_day: ride.month_day ?? null,
    weekday_ordinal: ride.weekday_ordinal ?? null,
    strict_schedule: ride.strict_schedule ?? true,
    challenges_enabled: ride.challenges_enabled ?? true,
  };
}

function parseForm(input: CreateRideInput) {
  const result = rideFormSchema.safeParse(input);
  if (!result.success) {
    throw new RideProductError('validation', result.error.issues[0]?.message);
  }
  return result.data;
}

function parseCode(code: string) {
  const result = rideCodeSchema.safeParse(code);
  if (!result.success) throw new RideProductError('invalid_code');
  return result.data;
}

// The server can't know the caller's timezone, so date range checks (has this
// Ride started/ended yet?) must be evaluated against the device's local date
// rather than the database server's `current_date`.
function localDateParam() {
  return format(new Date(), DATE_FORMAT);
}

function mutationParams(input: CreateRideInput) {
  const values = parseForm(input);
  const weekdays =
    values.scheduleKind === 'monthly_date'
      ? []
      : [...values.weekdays].sort((a, b) => a - b);
  return {
    p_name: values.name,
    p_description: values.description || null,
    p_start_date: values.startDate,
    p_end_date: values.neverEnds ? null : values.endDate,
    p_notification_time: values.notificationTime,
    p_weekdays: weekdays,
    p_strict_schedule:
      values.scheduleKind === 'weekly' ? values.strictSchedule : true,
    p_schedule_kind: values.scheduleKind,
    p_month_day: values.scheduleKind === 'monthly_date' ? values.monthDay : null,
    p_weekday_ordinal:
      values.scheduleKind === 'monthly_weekday' ? values.weekdayOrdinal : null,
    p_challenges_enabled: values.challengesEnabled,
  };
}

export async function createRide(input: CreateRideInput): Promise<Ride> {
  const { data, error } = await supabase.rpc('create_ride', {
    ...mutationParams(input),
    p_local_date: localDateParam(),
  });
  if (error) throw mapRideError(error);
  const ride = unwrapRide(data);
  trackRideCreated(ride.id);
  return ride;
}

export async function updateRide(input: UpdateRideInput): Promise<Ride> {
  const { rideId, ...form } = input;
  const { data, error } = await supabase.rpc('update_ride_with_schedule', {
    p_ride_id: rideId,
    ...mutationParams(form),
  });

  if (error) throw mapRideError(error);
  return unwrapRide(data);
}

function normalizePreviewStatus(status: unknown): RidePreviewStatus {
  if (typeof status !== 'string') return 'invalid';
  switch (status.toLowerCase()) {
    case 'available':
    case 'active':
    case 'joinable':
    case 'ok':
      return 'available';
    case 'upcoming':
    case 'not_started':
      return 'upcoming';
    case 'expired':
    case 'ended':
      return 'expired';
    case 'archived':
      return 'archived';
    case 'full':
    case 'at_capacity':
      return 'full';
    case 'duplicate':
    case 'already_member':
      return 'duplicate';
    case 'pending':
    case 'already_requested':
      return 'pending';
    default:
      return 'invalid';
  }
}

function toPreview(data: unknown): RidePreview {
  const raw = firstOrSelf(data as PreviewRecord | PreviewRecord[] | null);
  if (!raw) return { status: 'invalid', ride: null };

  const status = normalizePreviewStatus(raw.status);
  const hasDetails =
    typeof raw.id === 'string' &&
    typeof raw.name === 'string' &&
    typeof raw.start_date === 'string' &&
    (raw.end_date === null || typeof raw.end_date === 'string');

  return {
    status,
    ride: hasDetails
      ? {
          id: raw.id as string,
          name: raw.name as string,
          description: typeof raw.description === 'string' ? raw.description : null,
          start_date: raw.start_date as string,
          end_date: typeof raw.end_date === 'string' ? raw.end_date : null,
          member_count: typeof raw.member_count === 'number' ? raw.member_count : 0,
        }
      : null,
  };
}

function unwrapRide(data: unknown): Ride {
  const ride = firstOrSelf(data as Ride | Ride[] | null);
  if (!ride) throw new RideProductError('not_found');
  return normalizeRide(ride);
}

export async function fetchUserRides(userId: string): Promise<UserRide[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('ride_members')
    .select(`role,ride:rides!inner(${RIDE_COLUMNS})`)
    .eq('user_id', userId);

  if (error) throw mapRideError(error);

  const records = (data ?? []) as unknown as UserRideRecord[];
  return records.flatMap((record) => {
    const ride = record.ride ? firstOrSelf(record.ride) : null;
    return ride
      ? [{ ...normalizeRide(ride), current_user_role: record.role }]
      : [];
  });
}

export async function fetchRide(rideId: string): Promise<Ride> {
  const { data, error } = await supabase
    .from('rides')
    .select(RIDE_COLUMNS)
    .eq('id', rideId)
    .maybeSingle();

  if (error) throw mapRideError(error);
  return unwrapRide(data);
}

export async function fetchRideMembers(rideId: string): Promise<RideMember[]> {
  const { data, error } = await supabase
    .from('ride_members')
    .select(
      'id,ride_id,user_id,joined_at,role,profile:profiles!ride_members_user_id_fkey(id,username,display_name,avatar_url)',
    )
    .eq('ride_id', rideId)
    .order('joined_at', { ascending: true });

  if (error) throw mapRideError(error);

  return ((data ?? []) as unknown as RideMemberRecord[]).map((member) => ({
    ...member,
    profile: member.profile ? firstOrSelf(member.profile) : null,
  }));
}

type MemberSummaryRecord = {
  ride_id: string;
};

/** One round-trip: member counts for many Rides. */
export async function fetchRideMemberSummaries(
  rideIds: readonly string[],
): Promise<Record<string, RideMemberSummary>> {
  if (!rideIds.length) return {};

  const { data, error } = await supabase
    .from('ride_members')
    .select('ride_id')
    .in('ride_id', [...rideIds]);

  if (error) throw mapRideError(error);

  const summaries: Record<string, RideMemberSummary> = {};
  for (const rideId of rideIds) {
    summaries[rideId] = { count: 0 };
  }

  for (const row of (data ?? []) as unknown as MemberSummaryRecord[]) {
    const summary = summaries[row.ride_id];
    if (!summary) continue;
    summary.count += 1;
  }

  return summaries;
}

export async function fetchRideJoinRequests(rideId: string): Promise<RideJoinRequest[]> {
  const { data, error } = await supabase
    .from('ride_join_requests')
    .select(
      'id,ride_id,user_id,status,created_at,resolved_at,resolved_by,profile:profiles!ride_join_requests_user_id_fkey(id,username,display_name,avatar_url)',
    )
    .eq('ride_id', rideId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw mapRideError(error);

  return ((data ?? []) as unknown as RideJoinRequestRecord[]).map((request) => ({
    ...request,
    profile: request.profile ? firstOrSelf(request.profile) : null,
  }));
}

type MyPendingJoinRequestRecord = Omit<MyPendingJoinRequest, 'ride'> & {
  ride:
    | Pick<Ride, 'id' | 'name' | 'description' | 'is_archived'>
    | Pick<Ride, 'id' | 'name' | 'description' | 'is_archived'>[]
    | null;
};

/** Pending join requests submitted by the current user (not yet accepted). */
export async function fetchMyPendingJoinRequests(
  userId: string,
): Promise<MyPendingJoinRequest[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('ride_join_requests')
    .select(
      'id,ride_id,created_at,ride:rides!ride_join_requests_ride_id_fkey(id,name,description,is_archived)',
    )
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw mapRideError(error);

  return ((data ?? []) as unknown as MyPendingJoinRequestRecord[]).map((request) => ({
    id: request.id,
    ride_id: request.ride_id,
    created_at: request.created_at,
    ride: request.ride ? firstOrSelf(request.ride) : null,
  }));
}

export async function fetchRideSchedule(rideId: string): Promise<RideScheduleDay[]> {
  const { data, error } = await supabase
    .from('ride_schedule_days')
    .select('ride_id,weekday')
    .eq('ride_id', rideId)
    .order('weekday', { ascending: true });

  if (error) throw mapRideError(error);
  return (data ?? []) as unknown as RideScheduleDay[];
}

export async function previewRideByCode(code: string): Promise<RidePreview> {
  const { data, error } = await supabase.rpc('preview_ride_by_code', {
    p_code: parseCode(code),
    p_local_date: localDateParam(),
  });

  if (error) throw mapRideError(error);
  return toPreview(data);
}

export async function joinRideByCode(code: string): Promise<Ride> {
  const { data, error } = await supabase.rpc('join_ride_by_code', {
    p_code: parseCode(code),
    p_local_date: localDateParam(),
  });

  if (error) throw mapRideError(error);
  const ride = unwrapRide(data);
  trackRideJoinRequested(ride.id);
  return ride;
}

/** Creates a pending join request; membership starts only after the owner accepts. */
export async function requestJoinRideByCode(code: string): Promise<Ride> {
  return joinRideByCode(code);
}

export async function acceptRideJoinRequest(requestId: string): Promise<RideJoinRequest> {
  const { data, error } = await supabase.rpc('accept_ride_join_request', {
    p_request_id: requestId,
    p_local_date: localDateParam(),
  });
  if (error) throw mapRideError(error);
  const request = firstOrSelf(data as Omit<RideJoinRequest, 'profile'> | null);
  if (!request) throw new RideProductError('not_found');
  trackRideJoined(request.ride_id, request.user_id);
  return { ...request, profile: null };
}

export async function rejectRideJoinRequest(requestId: string): Promise<RideJoinRequest> {
  const { data, error } = await supabase.rpc('reject_ride_join_request', {
    p_request_id: requestId,
  });
  if (error) throw mapRideError(error);
  const request = firstOrSelf(data as Omit<RideJoinRequest, 'profile'> | null);
  if (!request) throw new RideProductError('not_found');
  return { ...request, profile: null };
}

export async function removeRideMember(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_ride_member', {
    p_ride_id: rideId,
    p_user_id: userId,
  });
  if (error) throw mapRideError(error);
}

export async function leaveRide(rideId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_ride', { p_ride_id: rideId });
  if (error) throw mapRideError(error);
}

export async function deleteRide(rideId: string): Promise<void> {
  // Storage API first — SQL deletes only drop metadata and orphan the files.
  try {
    await removeRidePostFiles(rideId);
  } catch (cause) {
    throw new RideProductError(
      'unknown',
      cause instanceof Error
        ? cause.message
        : 'Ride photos could not be removed from storage.',
      { cause },
    );
  }

  const { error } = await supabase.rpc('delete_ride', { p_ride_id: rideId });
  if (error) throw mapRideError(error);
}

export async function archiveRide(rideId: string): Promise<Ride> {
  const { data, error } = await supabase.rpc('archive_ride', { p_ride_id: rideId });
  if (error) throw mapRideError(error);
  return unwrapRide(data);
}

export async function unarchiveRide(rideId: string): Promise<Ride> {
  const { data, error } = await supabase.rpc('unarchive_ride', {
    p_ride_id: rideId,
    p_local_date: localDateParam(),
  });
  if (error) throw mapRideError(error);
  return unwrapRide(data);
}

export async function fetchPostedTodayStatus(
  rideId: string,
  userId: string,
  scheduledDate: string,
): Promise<PostedTodayStatus> {
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('ride_id', rideId)
    .eq('user_id', userId)
    .eq('scheduled_date', scheduledDate)
    .eq('is_temporary', false)
    // Challenge permanents do not consume the cadence slot.
    .is('ride_challenge_id', null)
    .maybeSingle();

  if (error) throw mapRideError(error);
  const post = data as unknown as { id: string } | null;
  return { hasPosted: post !== null, postId: post?.id ?? null };
}

/** Whether a member has posted anywhere in the supplied Sunday-Saturday week. */
export async function fetchWeekPostStatus(
  rideId: string,
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<PostedTodayStatus> {
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('ride_id', rideId)
    .eq('user_id', userId)
    .eq('is_temporary', false)
    // Challenge permanents do not satisfy flexible-week cadence.
    .is('ride_challenge_id', null)
    .gte('scheduled_date', weekStart)
    .lte('scheduled_date', weekEnd)
    .maybeSingle();

  if (error) throw mapRideError(error);
  const post = data as unknown as { id: string } | null;
  return { hasPosted: post !== null, postId: post?.id ?? null };
}

/**
 * Max cadence scheduled_date the current user has durably unlocked for a ride.
 * Survives post delete; null if they have never unlocked any day.
 */
export async function fetchCadenceUnlockedThrough(
  rideId: string,
): Promise<string | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw mapRideError(authError);
  if (!authData.user) {
    throw new RideProductError('forbidden', 'Sign in to continue.');
  }

  const { data, error } = await supabase
    .from('ride_cadence_unlocks')
    .select('scheduled_date')
    .eq('ride_id', rideId)
    .eq('user_id', authData.user.id)
    .order('scheduled_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw mapRideError(error);
  const row = data as unknown as { scheduled_date: string } | null;
  return row?.scheduled_date ?? null;
}
