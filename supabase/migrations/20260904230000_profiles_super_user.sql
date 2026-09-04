-- Super-user flag for staff-only surfaces (Inbox, Shop).
-- Clients cannot self-elevate; set via SQL / service role.

alter table public.profiles
  add column if not exists is_super_user boolean not null default false;

comment on column public.profiles.is_super_user is
  'Staff-only app surfaces (Inbox, Shop). Not writable by clients.';

create or replace function public.profiles_protect_super_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Block authenticated clients from self-elevating. SQL editor / service_role
  -- (auth.uid() is null) can still set the flag.
  if tg_op = 'UPDATE'
     and new.is_super_user is distinct from old.is_super_user
     and auth.uid() is not null then
    raise exception 'is_super_user cannot be changed by clients'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_protect_super_user()
  from public, anon, authenticated;

drop trigger if exists profiles_protect_super_user on public.profiles;
create trigger profiles_protect_super_user
before update on public.profiles
for each row
execute function public.profiles_protect_super_user();
