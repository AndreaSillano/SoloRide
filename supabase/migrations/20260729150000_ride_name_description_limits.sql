-- Cap ride name at 20 characters and description at 30.

update public.rides
set name = left(btrim(name), 20)
where char_length(btrim(name)) > 20;

update public.rides
set description = left(description, 30)
where description is not null
  and char_length(description) > 30;

alter table public.rides
  drop constraint if exists rides_name_length;

alter table public.rides
  add constraint rides_name_length
  check (char_length(btrim(name)) between 1 and 20);

alter table public.rides
  drop constraint if exists rides_description_length;

alter table public.rides
  add constraint rides_description_length
  check (description is null or char_length(description) <= 30);
