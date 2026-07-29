-- Include an iOS app-icon badge on social Expo push payloads.

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
        'badge', 1,
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
        'badge', 1,
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
