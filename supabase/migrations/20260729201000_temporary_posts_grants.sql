-- Allow clients to write temporary-post columns (foundation used column grants).

grant insert (
  id,
  ride_id,
  user_id,
  scheduled_date,
  image_path,
  description,
  latitude,
  longitude,
  location_name,
  is_temporary,
  expires_at
)
  on table public.posts to authenticated;

grant update (
  scheduled_date,
  image_path,
  description,
  latitude,
  longitude,
  location_name,
  is_temporary,
  expires_at
)
  on table public.posts to authenticated;
