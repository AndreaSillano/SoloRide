-- Permanent one-emoji-per-member reactions on posts.
-- Allowed emoji values are enforced by the client so the set stays easy to change.

create table public.post_reactions (
  id uuid primary key default extensions.gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_reactions_post_user_key unique (post_id, user_id),
  constraint post_reactions_emoji_length check (
    char_length(emoji) between 1 and 16
  )
);

create index post_reactions_post_created_at_idx
  on public.post_reactions (post_id, created_at desc);

create index post_reactions_user_id_idx
  on public.post_reactions (user_id);

create trigger post_reactions_set_updated_at
before update on public.post_reactions
for each row execute function public.set_updated_at();

alter table public.post_reactions enable row level security;

create policy post_reactions_select_members
on public.post_reactions
for select
to authenticated
using (public.is_post_ride_member(post_id));

create policy post_reactions_insert_own
on public.post_reactions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
);

create policy post_reactions_update_own
on public.post_reactions
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
);

create policy post_reactions_delete_own
on public.post_reactions
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
);

revoke all on table public.post_reactions from anon, authenticated;
grant select, delete on table public.post_reactions to authenticated;
grant insert (id, post_id, user_id, emoji)
  on table public.post_reactions to authenticated;
grant update (emoji)
  on table public.post_reactions to authenticated;
