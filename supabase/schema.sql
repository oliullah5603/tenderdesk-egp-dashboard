-- Tenderdesk account access model. Run this once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
drop policy if exists "Members can read own profile; admins can read workspace profiles" on public.profiles;
create policy "Members can read own profile; admins can read workspace profiles"
  on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin' and me.status = 'approved'
  ));

create or replace function public.create_tenderdesk_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'pending')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists tenderdesk_profile_after_signup on auth.users;
create trigger tenderdesk_profile_after_signup after insert on auth.users
  for each row execute function public.create_tenderdesk_profile();

create or replace function public.admin_set_user_access(target_user_id uuid, next_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'approved') then
    raise exception 'Administrator access required';
  end if;
  if next_status not in ('approved', 'pending', 'blocked') then raise exception 'Invalid account status'; end if;
  if target_user_id = auth.uid() and next_status <> 'approved' then raise exception 'You cannot revoke your own access'; end if;
  update public.profiles set status = next_status where id = target_user_id;
  if not found then raise exception 'Account not found'; end if;
end;
$$;

create or replace function public.admin_create_profile(target_email text, target_name text default '', target_role text default 'member')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'approved') then
    raise exception 'Administrator access required';
  end if;
  if target_role not in ('member', 'admin') then raise exception 'Invalid account role'; end if;
  insert into public.profiles (id, email, full_name, status, role)
  select id, email, coalesce(nullif(target_name, ''), coalesce(raw_user_meta_data->>'full_name', '')), 'approved', target_role
  from auth.users where lower(email) = lower(target_email)
  on conflict (id) do update set full_name = coalesce(nullif(target_name, ''), public.profiles.full_name), status = 'approved', role = target_role;
  if not found then raise exception 'Create the user in Supabase Auth first, then add their email here'; end if;
end;
$$;

revoke all on function public.admin_set_user_access(uuid, text) from public, anon;
revoke all on function public.admin_create_profile(text, text, text) from public, anon;
grant execute on function public.admin_set_user_access(uuid, text) to authenticated;
grant execute on function public.admin_create_profile(text, text, text) to authenticated;

-- First-admin bootstrap: create/confirm your Auth user, then run this once with your email.
-- update public.profiles set role = 'admin', status = 'approved' where lower(email) = lower('YOUR_ADMIN_EMAIL');
