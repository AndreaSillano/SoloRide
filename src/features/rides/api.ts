import { format } from 'date-fns';

import { supabase } from '@/lib/supabase';
import { DATE_FORMAT } from '@/utils/schedule';

import { mapRideError, RideProductError } from './errors';
import { rideCodeSchema, rideFormSchema } from './schema';
import type {
  CreateRideInput,
  PostedTodayStatus,
  Ride,
  RideMember,
  RidePreview,
  RidePreviewDetails,
  RidePreviewStatus,
  RideRole,
  RideScheduleDay,
  UpdateRideInput,
  UserRide,
} from './types';

const RIDE_COLUMNS =
  'id,name,description,code,creator_id,start_date,end_date,notification_time,strict_schedule,is_archived,archived_at,created_at,updated_at';

type UserRideRecord = {
  role: RideRole;
  ride: Ride | Ride[] | null;
};

type RideMemberRecord = Omit<RideMember, 'profile'> & {
  profile: RideMember['profile'] | RideMember['profile'][] | null;
};

type PreviewRecord = Partial<RidePreviewDetails> & {
  status?: unknown;
};

function firstOrSelf<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] ?? null : value;
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
  return {
    p_name: values.name,
    p_description: values.description || null,
    p_start_date: values.startDate,
    p_end_date: values.endDate,
    p_notification_time: values.notificationTime,
    p_weekdays: [...values.weekdays].sort((a, b) => a - b),
    p_strict_schedule: values.strictSchedule,
  };
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
    case 'duplicate':
    case 'already_member':
      return 'duplicate';
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
    typeof raw.end_date === 'string';

  return {
    status,
    ride: hasDetails
      ? {
          id: raw.id as string,
          name: raw.name as string,
          description: typeof raw.description === 'string' ? raw.description : null,
          start_date: raw.start_date as string,
          end_date: raw.end_date as string,
          member_count: typeof raw.member_count === 'number' ? raw.member_count : 0,
        }
      : null,
  };
}

function unwrapRide(data: unknown): Ride {
  const ride = firstOrSelf(data as Ride | Ride[] | null);
  if (!ride) throw new RideProductError('not_found');
  return ride;
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
    return ride ? [{ ...ride, current_user_role: record.role }] : [];
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

export async function createRide(input: CreateRideInput): Promise<Ride> {
  const { data, error } = await supabase.rpc('create_ride', mutationParams(input));
  if (error) throw mapRideError(error);
  return unwrapRide(data);
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

export async function joinRideByCode(code: string): Promise<Ride> {
  const { data, error } = await supabase.rpc('join_ride_by_code', {
    p_code: parseCode(code),
    p_local_date: localDateParam(),
  });

  if (error) throw mapRideError(error);
  return unwrapRide(data);
}

export async function leaveRide(rideId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_ride', { p_ride_id: rideId });
  if (error) throw mapRideError(error);
}

export async function archiveRide(rideId: string): Promise<Ride> {
  const { data, error } = await supabase.rpc('archive_ride', { p_ride_id: rideId });
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
    .gte('scheduled_date', weekStart)
    .lte('scheduled_date', weekEnd)
    .maybeSingle();

  if (error) throw mapRideError(error);
  const post = data as unknown as { id: string } | null;
  return { hasPosted: post !== null, postId: post?.id ?? null };
}
