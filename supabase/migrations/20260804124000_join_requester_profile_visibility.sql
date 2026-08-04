-- Let Ride owners read profiles of users with a pending join request on their
-- Ride (name + avatar). Previously profiles RLS only allowed shared members,
-- so requesters showed up as blank "Rider" rows.

create or replace function public.can_view_join_requester_profile(
  p_profile_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id is not null
    and p_user_id is not null
    and exists (
      select 1
      from public.ride_join_requests as req
      where req.user_id = p_profile_id
        and req.status = 'pending'
        and public.is_ride_creator(req.ride_id, p_user_id)
    );
$$;

revoke execute on function public.can_view_join_requester_profile(uuid, uuid)
  from public, anon;
grant execute on function public.can_view_join_requester_profile(uuid, uuid)
  to authenticated;

drop policy if exists profiles_select_shared on public.profiles;

create policy profiles_select_shared
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.shares_ride_with(id)
  or public.can_view_join_requester_profile(id)
);
