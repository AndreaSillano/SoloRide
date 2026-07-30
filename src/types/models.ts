export type RideRole = 'creator' | 'member';

export type Profile = {
  id: string;
  username: string;
  username_normalized: string;
  display_name: string | null;
  avatar_url: string | null;
  recovery_email: string | null;
  recovery_email_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type Ride = {
  id: string;
  name: string;
  description: string | null;
  code: string;
  creator_id: string;
  start_date: string;
  end_date: string | null;
  notification_time: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type RideScheduleDay = {
  id: string;
  ride_id: string;
  weekday: number;
  created_at: string;
};

export type RideMember = {
  id: string;
  ride_id: string;
  user_id: string;
  joined_at: string;
  role: RideRole;
  profile?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export type RideWithSchedule = Ride & {
  ride_schedule_days: RideScheduleDay[];
  ride_members?: RideMember[];
};

export type RidePreview = Pick<
  Ride,
  'id' | 'name' | 'description' | 'start_date' | 'end_date'
> & {
  member_count: number;
};

export type Post = {
  id: string;
  ride_id: string;
  user_id: string;
  image_path: string;
  audio_path: string | null;
  video_path: string | null;
  video_duration_ms: number | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};
