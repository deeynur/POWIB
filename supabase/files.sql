-- POWIB Organization Hub: who can open uploaded files. Run after setup.sql. Safe to run again.
-- Before this, any approved account could list and download every file. Now a person can only open a file
-- they uploaded, or one attached to a record they are allowed to see (so a Staff account only gets its own
-- timesheets and appraisals, and HR files stay with HR and the ED).

-- True when the file is mentioned in a record the signed-in person can see. Runs with their own access rules.
create or replace function public.file_visible(file text) returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.records r where position(('"' || file || '"') in r.data::text) > 0)
$$;
revoke execute on function public.file_visible(text) from public, anon;
grant execute on function public.file_visible(text) to authenticated;

drop policy if exists "approved users read files" on storage.objects;
create policy "approved users read files" on storage.objects for select
  using (bucket_id = 'hub-files' and public.my_role() is not null
         and (owner_id = auth.uid()::text or public.file_visible(name)));

-- Uploads are capped at 20 MB, like the app.
update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'hub-files';
