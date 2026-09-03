-- SoloRide / Rodeo content & group KPIs
-- Run these in the Supabase SQL editor. Not a migration.
--
-- Definitions:
--   last_activity  = greatest(latest post created_at, latest comment created_at
--                    on a post in the ride). Falls back to rides.created_at
--                    when the ride has no posts/comments yet.
--   group survival after X days = last_activity >= created_at + X days
--                    (the ride was still active at least X days after creation).
--   engagement-active user = posted or commented in the chosen window.
--
-- Note: Amplitude DAU is app-open-active. Rates below use content-active
-- denominators and will not match Amplitude 1:1.

-- Shared: last activity per ride (reuse in editor by running as a CTE).
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 1. Average group size (members per Rodeo)
-- =============================================================================
select
  count(*)::bigint as ride_count,
  round(avg(member_count)::numeric, 2) as avg_group_size,
  percentile_cont(0.5) within group (order by member_count) as median_group_size,
  min(member_count) as min_group_size,
  max(member_count) as max_group_size
from (
  select
    r.id,
    count(rm.id)::integer as member_count
  from public.rides r
  left join public.ride_members rm on rm.ride_id = r.id
  group by r.id
) sizes;

-- =============================================================================
-- 2. Average group duration (creation → last activity)
-- =============================================================================
with ride_activity as (
  select
    r.id,
    r.created_at,
    greatest(
      r.created_at,
      coalesce(
        (
          select max(p.created_at)
          from public.posts p
          where p.ride_id = r.id
        ),
        r.created_at
      ),
      coalesce(
        (
          select max(c.created_at)
          from public.comments c
          join public.posts p on p.id = c.post_id
          where p.ride_id = r.id
        ),
        r.created_at
      )
    ) as last_activity_at
  from public.rides r
)
select
  count(*)::bigint as ride_count,
  round(avg(extract(epoch from (last_activity_at - created_at)) / 86400.0)::numeric, 2)
    as avg_duration_days,
  round(
    (percentile_cont(0.5) within group (
      order by extract(epoch from (last_activity_at - created_at)) / 86400.0
    ))::numeric,
    2
  ) as median_duration_days
from ride_activity;

-- =============================================================================
-- 3. Group survival (7 / 30 / 90 days)
-- Still active after X days := last_activity_at >= created_at + X days
-- Only rides old enough to have reached the horizon are included in each %.
-- =============================================================================
with ride_activity as (
  select
    r.id,
    r.created_at,
    greatest(
      r.created_at,
      coalesce(
        (select max(p.created_at) from public.posts p where p.ride_id = r.id),
        r.created_at
      ),
      coalesce(
        (
          select max(c.created_at)
          from public.comments c
          join public.posts p on p.id = c.post_id
          where p.ride_id = r.id
        ),
        r.created_at
      )
    ) as last_activity_at
  from public.rides r
)
select
  round(
    100.0 * count(*) filter (
      where created_at <= now() - interval '7 days'
        and last_activity_at >= created_at + interval '7 days'
    )
    / nullif(count(*) filter (where created_at <= now() - interval '7 days'), 0),
    2
  ) as survival_7d_pct,
  round(
    100.0 * count(*) filter (
      where created_at <= now() - interval '30 days'
        and last_activity_at >= created_at + interval '30 days'
    )
    / nullif(count(*) filter (where created_at <= now() - interval '30 days'), 0),
    2
  ) as survival_30d_pct,
  round(
    100.0 * count(*) filter (
      where created_at <= now() - interval '90 days'
        and last_activity_at >= created_at + interval '90 days'
    )
    / nullif(count(*) filter (where created_at <= now() - interval '90 days'), 0),
    2
  ) as survival_90d_pct
from ride_activity;

-- =============================================================================
-- 4. Messages (comments) per engagement-active user / per group
-- Window: last 30 days. Change the interval below as needed.
-- =============================================================================
with bounds as (
  select
    (now() - interval '30 days') as window_start,
    now() as window_end
),
window_comments as (
  select
    c.id,
    c.user_id,
    p.ride_id
  from public.comments c
  join public.posts p on p.id = c.post_id
  cross join bounds b
  where c.created_at >= b.window_start
    and c.created_at < b.window_end
),
active_users as (
  select distinct user_id from window_comments
  union
  select distinct p.user_id
  from public.posts p
  cross join bounds b
  where p.created_at >= b.window_start
    and p.created_at < b.window_end
)
select
  (select count(*) from window_comments) as comments_in_window,
  (select count(*) from active_users) as engagement_active_users,
  (select count(distinct ride_id) from window_comments) as groups_with_comments,
  round(
    (select count(*) from window_comments)::numeric
    / nullif((select count(*) from active_users), 0),
    2
  ) as avg_comments_per_active_user,
  round(
    (select count(*) from window_comments)::numeric
    / nullif((select count(distinct ride_id) from window_comments), 0),
    2
  ) as avg_comments_per_group_with_comments,
  round(
    (select count(*) from window_comments)::numeric
    / nullif((select count(*) from public.rides), 0),
    2
  ) as avg_comments_per_all_groups;

-- =============================================================================
-- 5. Photos (posts) per engagement-active user / per group
-- Window: last 30 days. Change the interval below as needed.
-- =============================================================================
with bounds as (
  select
    (now() - interval '30 days') as window_start,
    now() as window_end
),
window_posts as (
  select
    p.id,
    p.user_id,
    p.ride_id
  from public.posts p
  cross join bounds b
  where p.created_at >= b.window_start
    and p.created_at < b.window_end
),
active_users as (
  select distinct user_id from window_posts
  union
  select distinct c.user_id
  from public.comments c
  join public.posts p on p.id = c.post_id
  cross join bounds b
  where c.created_at >= b.window_start
    and c.created_at < b.window_end
)
select
  (select count(*) from window_posts) as posts_in_window,
  (select count(*) from active_users) as engagement_active_users,
  (select count(distinct ride_id) from window_posts) as groups_with_posts,
  round(
    (select count(*) from window_posts)::numeric
    / nullif((select count(*) from active_users), 0),
    2
  ) as avg_posts_per_active_user,
  round(
    (select count(*) from window_posts)::numeric
    / nullif((select count(distinct ride_id) from window_posts), 0),
    2
  ) as avg_posts_per_group_with_posts,
  round(
    (select count(*) from window_posts)::numeric
    / nullif((select count(*) from public.rides), 0),
    2
  ) as avg_posts_per_all_groups;
