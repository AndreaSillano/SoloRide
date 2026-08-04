-- Improve join-request push copy: show the other person's name as the title
-- and attach their avatar via Expo richContent when available (Android shows
-- it out of the box; iOS needs a Notification Service Extension).

create or replace function public.notify_ride_creator_of_join_request()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  requester_name text;
  requester_avatar text;
  ride_name text;
  creator_id uuid;
  messages jsonb;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'Someone'),
    nullif(btrim(p.avatar_url), ''),
    r.name,
    r.creator_id
  into requester_name, requester_avatar, ride_name, creator_id
  from public.profiles p
  join public.rides r on r.id = new.ride_id
  where p.id = new.user_id;

  if creator_id is null or creator_id = new.user_id then
    return new;
  end if;

  select coalesce(jsonb_agg(payload), '[]'::jsonb)
  into messages
  from (
    select
      jsonb_strip_nulls(
        jsonb_build_object(
          'to', pt.token,
          'title', requester_name,
          'body', format('wants to join %s', coalesce(ride_name, 'your Ride')),
          'sound', 'default',
          'badge', 1,
          'data', jsonb_build_object(
            'kind', 'join_request',
            'rideId', new.ride_id,
            'requestId', new.id
          ),
          'richContent', case
            when requester_avatar is not null then
              jsonb_build_object('image', requester_avatar)
            else null
          end
        )
      ) as payload
    from public.push_tokens pt
    where pt.user_id = creator_id
  ) as payloads;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

create or replace function public.notify_requester_of_join_decision()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  owner_name text;
  owner_avatar text;
  ride_name text;
  messages jsonb;
  push_title text;
  push_body text;
begin
  if old.status <> 'pending' or new.status not in ('accepted', 'rejected') then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'The owner'),
    nullif(btrim(p.avatar_url), ''),
    r.name
  into owner_name, owner_avatar, ride_name
  from public.rides r
  join public.profiles p on p.id = r.creator_id
  where r.id = new.ride_id;

  if new.status = 'accepted' then
    push_title := owner_name;
    push_body := format('accepted you into %s', coalesce(ride_name, 'the Ride'));
  else
    push_title := owner_name;
    push_body := format('declined your request to join %s', coalesce(ride_name, 'the Ride'));
  end if;

  select coalesce(jsonb_agg(payload), '[]'::jsonb)
  into messages
  from (
    select
      jsonb_strip_nulls(
        jsonb_build_object(
          'to', pt.token,
          'title', push_title,
          'body', push_body,
          'sound', 'default',
          'badge', 1,
          'data', jsonb_build_object(
            'kind', 'join_request_decision',
            'rideId', new.ride_id,
            'requestId', new.id,
            'status', new.status
          ),
          'richContent', case
            when owner_avatar is not null then
              jsonb_build_object('image', owner_avatar)
            else null
          end
        )
      ) as payload
    from public.push_tokens pt
    where pt.user_id = new.user_id
  ) as payloads;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

revoke execute on function public.notify_ride_creator_of_join_request() from public, anon, authenticated;
revoke execute on function public.notify_requester_of_join_decision() from public, anon, authenticated;
