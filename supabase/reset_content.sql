-- SoloRide: wipe all app content while keeping schema, policies, and buckets.
--
-- Run manually against local or remote Postgres (SQL Editor / psql).
-- Do NOT add this file to migrations — it is intentionally destructive.
--
-- Clears:
--   - Storage object rows in ride-posts and avatars (buckets stay)
--   - All public app rows
--   - Auth users (and cascaded auth sessions / identities)
--
-- Storage note:
--   Direct SQL only removes storage.objects metadata. Prefer emptying the
--   ride-posts and avatars buckets in Dashboard → Storage (or via the
--   Storage API) so the underlying files are removed too. The allow flag
--   below is an intentional escape hatch for this one-off reset.
--
-- After this, the DB is empty: create accounts again through the app.

begin;

-- Required by storage.protect_delete(); Storage API sets this automatically.
select set_config('storage.allow_delete_query', 'true', true);

delete from storage.objects
where bucket_id in ('ride-posts', 'avatars');

-- App tables together so FK checks between them are deferred for the truncate.
truncate table
  public.post_reactions,
  public.comments,
  public.posts,
  public.ride_challenges,
  public.ride_schedule_days,
  public.ride_members,
  public.rides,
  public.push_tokens,
  public.profiles
restart identity cascade;
-- challenges catalog is seed data; keep rows unless you intentionally wipe it.

-- Auth last. rides.creator_id uses ON DELETE RESTRICT, so rides must
-- already be gone (handled by truncate above).
delete from auth.users;

commit;
