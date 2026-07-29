-- Temporary posts can sit on any calendar day inside the ride window.
-- Schedule/modality updates must only validate permanent publications.

create or replace function public.update_ride_with_schedule(
  p_ride_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_notification_time time without time zone,
  p_weekdays smallint[],
  p_description text default null,
  p_strict_schedule boolean default true
)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_ride public.rides;
begin
  if not public.is_ride_creator(p_ride_id, auth.uid()) then
    raise exception 'Only the ride creator may update this ride' using errcode = '42501';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be before start date' using errcode = '22023';
  end if;

  if p_weekdays is null
     or cardinality(p_weekdays) not between 1 and 7
     or array_position(p_weekdays, null) is not null then
    raise exception 'Weekdays must contain between 1 and 7 values' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.posts
    where ride_id = p_ride_id
      and is_temporary = false
      and (
        scheduled_date < p_start_date
        or (p_end_date is not null and scheduled_date > p_end_date)
      )
  ) then
    raise exception 'New ride dates would exclude existing posts' using errcode = '22023';
  end if;

  update public.rides
  set
    name = btrim(p_name),
    description = nullif(btrim(p_description), ''),
    start_date = p_start_date,
    end_date = p_end_date,
    notification_time = p_notification_time,
    strict_schedule = coalesce(p_strict_schedule, true)
  where id = p_ride_id
    and is_archived = false
  returning * into updated_ride;

  if not found then
    raise exception 'Active ride not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.posts
    where ride_id = p_ride_id
      and is_temporary = false
      and not (
        extract(dow from scheduled_date)::smallint = any(p_weekdays)
      )
  ) then
    raise exception 'New weekdays would exclude existing posts' using errcode = '22023';
  end if;

  perform public.replace_ride_schedule(p_ride_id, p_weekdays);
  return updated_ride;
end;
$$;
