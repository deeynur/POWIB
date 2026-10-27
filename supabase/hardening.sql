-- POWIB Organization Hub: locks down the database API and adds rate limits. Run after the other scripts. Safe to run again.

-- ---------- API: nothing for visitors who are not signed in ----------
-- The Hub's helper functions are only callable by signed-in users (they were callable by anyone with the public key).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------- Records: only known collections, sensible ids and sizes ----------
alter table public.records drop constraint if exists records_collection_valid;
alter table public.records add constraint records_collection_valid check (collection in
  ('requests', 'payments', 'documents', 'vendors', 'vendor_bank', 'emails', 'hrstaff', 'hrleave', 'timesheets', 'appraisals', 'settings', 'signatures'));
alter table public.records drop constraint if exists records_id_valid;
alter table public.records add constraint records_id_valid check (length(id) between 1 and 100);
-- One record may hold up to 1 MB of text (files are stored separately).
alter table public.records drop constraint if exists records_size_limit;
alter table public.records add constraint records_size_limit check (octet_length(data::text) <= 1000000);
alter table public.profiles drop constraint if exists profiles_name_length;
alter table public.profiles add constraint profiles_name_length check (length(coalesce(full_name, '')) <= 120);

-- ---------- Rate limit: changes per person per minute ----------
-- Generous enough for importing a whole vendor list at once, but stops a script flooding the Hub.
create index if not exists records_audit_actor_at on public.records_audit (actor, at);
create or replace function public.records_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (select count(*) from public.records_audit where actor = auth.uid() and at > now() - interval '1 minute') >= 300 then
    raise exception 'Too many changes in a short time. Wait a minute and try again.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists records_rate_limit on public.records;
create trigger records_rate_limit before insert or update or delete on public.records
  for each row execute function public.records_rate_limit();

-- ---------- Rate limit: uploads per person per minute ----------
create or replace function public.my_recent_uploads() returns int language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects
  where bucket_id = 'hub-files' and owner_id = auth.uid()::text and created_at > now() - interval '1 minute'
$$;
revoke execute on function public.my_recent_uploads() from public, anon;
grant execute on function public.my_recent_uploads() to authenticated;
drop policy if exists "approved users upload files" on storage.objects;
create policy "approved users upload files" on storage.objects for insert
  with check (bucket_id = 'hub-files' and public.my_role() is not null and public.my_recent_uploads() < 30);
