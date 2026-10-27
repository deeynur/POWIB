-- POWIB Organization Hub: database setup for Supabase.
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run. Safe to run again.

-- ---------- Accounts ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'Staff',          -- PM, Program, Logistics (Procurement), Finance, HR, ED, Staff
  approved boolean not null default false,     -- new sign-ups wait until an admin approves them
  is_admin boolean not null default false,     -- admins approve accounts and set roles
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- A profile is created for every new sign-up. The very first account becomes an approved admin (HR).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean;
begin
  select not exists (select 1 from public.profiles) into first;
  insert into public.profiles (id, email, full_name, role, approved, is_admin)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
          case when first then 'HR' else 'Staff' end, first, first)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers used by the security rules (run with the caller's id, read the profile once).
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select case when approved then role end from public.profiles where id = auth.uid()
$$;
create or replace function public.i_am_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select approved and is_admin from public.profiles where id = auth.uid()), false)
$$;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid());
drop policy if exists "admins and HR read all profiles" on public.profiles;
create policy "admins and HR read all profiles" on public.profiles for select
  using (public.i_am_admin() or public.my_role() in ('HR', 'ED'));
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles for update
  using (public.i_am_admin()) with check (public.i_am_admin());
drop policy if exists "admins delete profiles" on public.profiles;
create policy "admins delete profiles" on public.profiles for delete using (public.i_am_admin());

-- ---------- Records (requests, payments, vendors, documents, HR, settings…) ----------
create table if not exists public.records (
  collection text not null,
  id text not null,
  data jsonb not null,
  staff_user uuid references auth.users (id) on delete set null,   -- the staff member a HR record belongs to
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (collection, id)
);
alter table public.records enable row level security;

-- Who may see or change a record:
--   HR records (staff, leave, timesheets, appraisals): HR and ED, plus the staff member's own rows.
--   Signatures: each person their own.  Settings (templates): everyone approved can read.
--   Everything else: all approved roles except Staff.
create or replace function public.can_access(col text, rid text, owner uuid, writing boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() is null then false
    when col = 'signatures' then rid = auth.uid()::text
    when col in ('hrstaff', 'hrleave', 'timesheets', 'appraisals')
      then public.my_role() in ('HR', 'ED') or (owner = auth.uid() and (not writing or col in ('timesheets', 'appraisals')))
    when col = 'settings' then not writing or public.my_role() <> 'Staff'
    else public.my_role() <> 'Staff'
  end
$$;

drop policy if exists "read records" on public.records;
create policy "read records" on public.records for select using (public.can_access(collection, id, staff_user, false));
drop policy if exists "add records" on public.records;
create policy "add records" on public.records for insert with check (public.can_access(collection, id, staff_user, true));
drop policy if exists "change records" on public.records;
create policy "change records" on public.records for update
  using (public.can_access(collection, id, staff_user, true)) with check (public.can_access(collection, id, staff_user, true));
drop policy if exists "remove records" on public.records;
create policy "remove records" on public.records for delete
  using (public.my_role() is not null and public.my_role() <> 'Staff' and public.can_access(collection, id, staff_user, true));

-- Live updates: everyone sees changes as they happen.
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;
alter table public.records replica identity full;

-- Signed-in users may use the tables (the rules above still decide which rows). Visitors who are not signed in get nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant select, update, delete on public.profiles to authenticated;
grant execute on function public.my_role(), public.i_am_admin(), public.can_access(text, text, uuid, boolean) to authenticated;
revoke all on public.records, public.profiles from anon;

-- ---------- Files (uploaded forms, signatures, attachments) ----------
insert into storage.buckets (id, name, public) values ('hub-files', 'hub-files', false)
  on conflict (id) do nothing;

drop policy if exists "approved users read files" on storage.objects;
create policy "approved users read files" on storage.objects for select
  using (bucket_id = 'hub-files' and public.my_role() is not null);
drop policy if exists "approved users upload files" on storage.objects;
create policy "approved users upload files" on storage.objects for insert
  with check (bucket_id = 'hub-files' and public.my_role() is not null);
