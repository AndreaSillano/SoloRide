-- Social push notifications: store Expo push tokens and notify ride
-- members / post authors via the Expo Push API when posts or comments land.

create extension if not exists pg_net with schema extensions;

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_length check (char_length(token) between 16 and 512)
);

create unique index push_tokens_token_key on public.push_tokens (token);
create index push_tokens_user_id_idx on public.push_tokens (user_id);

create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row
execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

create policy push_tokens_select_own
on public.push_tokens
for select
to authenticated
using (user_id = auth.uid());

create policy push_tokens_insert_own
on public.push_tokens
for insert
to authenticated
with check (user_id = auth.uid());

create policy push_tokens_update_own
on public.push_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy push_tokens_delete_own
on public.push_tokens
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table public.push_tokens from anon, authenticated;
grant select, insert, update, delete on table public.push_tokens to authenticated;

create or replace function public.send_expo_push_messages(messages jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if messages is null or jsonb_typeof(messages) <> 'array' or jsonb_array_length(messages) = 0 then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    ),
    body := messages
  );
end;
$$;

revoke all on function public.send_expo_push_messages(jsonb) from public, anon, authenticated;

create or replace function public.notify_ride_members_of_new_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  author_username text;
  ride_name text;
  messages jsonb;
begin
  select p.username, r.name
  into author_username, ride_name
  from public.profiles p
  join public.rides r on r.id = new.ride_id
  where p.id = new.user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', 'New photo',
        'body', format('@%s posted in %s', coalesce(author_username, 'Someone'), coalesce(ride_name, 'your Ride')),
        'sound', 'default',
        'data', jsonb_build_object(
          'kind', 'social_post',
          'rideId', new.ride_id,
          'postId', new.id
        )
      )
    ),
    '[]'::jsonb
  )
  into messages
  from public.push_tokens pt
  join public.ride_members rm on rm.user_id = pt.user_id
  where rm.ride_id = new.ride_id
    and pt.user_id <> new.user_id;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

create or replace function public.notify_post_author_of_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  commenter_username text;
  post_author_id uuid;
  ride_id uuid;
  ride_name text;
  messages jsonb;
begin
  select p.user_id, p.ride_id, r.name, c.username
  into post_author_id, ride_id, ride_name, commenter_username
  from public.posts p
  join public.rides r on r.id = p.ride_id
  join public.profiles c on c.id = new.user_id
  where p.id = new.post_id;

  if post_author_id is null or post_author_id = new.user_id then
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', 'New comment',
        'body', format(
          '@%s commented on your photo in %s',
          coalesce(commenter_username, 'Someone'),
          coalesce(ride_name, 'your Ride')
        ),
        'sound', 'default',
        'data', jsonb_build_object(
          'kind', 'social_comment',
          'rideId', ride_id,
          'postId', new.post_id,
          'commentId', new.id
        )
      )
    ),
    '[]'::jsonb
  )
  into messages
  from public.push_tokens pt
  where pt.user_id = post_author_id;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

revoke all on function public.notify_ride_members_of_new_post() from public, anon, authenticated;
revoke all on function public.notify_post_author_of_new_comment() from public, anon, authenticated;

create trigger posts_notify_members
after insert on public.posts
for each row
execute function public.notify_ride_members_of_new_post();

create trigger comments_notify_author
after insert on public.comments
for each row
execute function public.notify_post_author_of_new_comment();
