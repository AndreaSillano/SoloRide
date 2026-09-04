export type RideRole = 'creator' | 'member';

export type ScheduleKind =
  | 'weekly'
  | 'biweekly'
  | 'monthly_date'
  | 'monthly_weekday';

export type Ride = {
  id: string;
  name: string;
  description: string | null;
  code: string;
  creator_id: string;
  start_date: string;
  end_date: string | null;
  notification_time: string;
  strict_schedule: boolean;
  schedule_kind: ScheduleKind;
  month_day: number | null;
  weekday_ordinal: number | null;
  challenges_enabled: boolean;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRide = Ride & {
  current_user_role: RideRole;
};

/** Lightweight member rollup for list cards. */
export type RideMemberSummary = {
  count: number;
};

export type RideScheduleDay = {
  ride_id: string;
  weekday: number;
};

export type RideMemberProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type RideMember = {
  id: string;
  ride_id: string;
  user_id: string;
  joined_at: string;
  role: RideRole;
  profile: RideMemberProfile | null;
};

export type RideJoinRequestStatus = 'pending' | 'accepted' | 'rejected';

export type RideJoinRequest = {
  id: string;
  ride_id: string;
  user_id: string;
  status: RideJoinRequestStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  profile: RideMemberProfile | null;
};

export type MyPendingJoinRequest = {
  id: string;
  ride_id: string;
  created_at: string;
  ride: Pick<Ride, 'id' | 'name' | 'description' | 'is_archived'> | null;
};

export type RideFormValues = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  neverEnds: boolean;
  notificationTime: string;
  scheduleKind: ScheduleKind;
  weekdays: number[];
  monthDay: number;
  weekdayOrdinal: number;
  strictSchedule: boolean;
  challengesEnabled: boolean;
};

export type CreateRideInput = RideFormValues;

export type UpdateRideInput = RideFormValues & {
  rideId: string;
};

export type RidePreviewStatus =
  | 'available'
  | 'invalid'
  | 'upcoming'
  | 'expired'
  | 'archived'
  | 'duplicate'
  | 'full'
  | 'pending';

export type RidePreviewDetails = Pick<
  Ride,
  'id' | 'name' | 'description' | 'start_date' | 'end_date'
> & {
  member_count: number;
};

export type RidePreview = {
  status: RidePreviewStatus;
  ride: RidePreviewDetails | null;
};

export type RideGroups = {
  active: UserRide[];
  upcoming: UserRide[];
  archived: UserRide[];
};

export type PostedTodayStatus = {
  hasPosted: boolean;
  postId: string | null;
};
