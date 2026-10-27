-- POWIB Organization Hub: protects staff accounts and admin rights. Run after setup.sql and security.sql. Safe to run again.
-- Only admins could already change accounts; this also stops mistakes and misuse that would lock the Hub out,
-- and writes every account change to the audit log.

-- Only these account fields can be changed from the Hub (never the id, email or creation date).
revoke update on public.profiles from authenticated;
grant update (full_name, role, approved, is_admin) on public.profiles to authenticated;

-- Roles must be one the Hub knows.
alter table public.profiles drop constraint if exists profiles_role_valid;
alter table public.profiles add constraint profiles_role_valid
  check (role in ('PM', 'Program', 'Logistics', 'Finance', 'HR', 'ED', 'Staff'));

create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_admin boolean;
  still_admin boolean := false;
begin
  -- Changes made in the Supabase dashboard (no signed-in Hub user) and new sign-ups are not checked.
  if auth.uid() is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'INSERT' then return new; end if;
  was_admin := old.is_admin and old.approved;
  if tg_op = 'UPDATE' then still_admin := new.is_admin and new.approved; end if;

  if not public.i_am_admin() then raise exception 'Only admins can change accounts.'; end if;

  if old.id = auth.uid() then
    if tg_op = 'DELETE' then raise exception 'You cannot delete your own account here.'; end if;
    if not still_admin then raise exception 'You cannot remove your own admin rights or access. Ask another admin.'; end if;
  end if;

  -- The Hub always keeps at least one approved admin.
  if was_admin and not still_admin
     and not exists (select 1 from public.profiles where id <> old.id and is_admin and approved) then
    raise exception 'The Hub needs at least one admin. Make someone else an admin first.';
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.email is distinct from old.email or new.created_at <> old.created_at then
      raise exception 'An account''s id, email and creation date cannot be changed.';
    end if;
    return new;
  end if;
  return old;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update or delete on public.profiles
  for each row execute function public.profiles_guard();

-- Every account change goes into the audit log (collection "profiles").
create or replace function public.profiles_audit_write() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.records_audit (actor, actor_name, actor_role, collection, record_id, action, old_data, new_data)
  values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), public.my_role(),
          'profiles', coalesce(new.id, old.id)::text, lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.profiles_audit_write();
