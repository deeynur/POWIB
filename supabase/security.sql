-- POWIB Organization Hub: server-side rules and audit log. Run after setup.sql (SQL Editor → New query → Run). Safe to run again.
-- The app's buttons already follow these rules; this makes the database refuse anything that breaks them,
-- even if someone bypasses the app.

-- ---------- Audit log: every change to a record, written by the database, readable by admins and the ED ----------
create table if not exists public.records_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_name text,
  actor_role text,
  collection text not null,
  record_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb
);
alter table public.records_audit enable row level security;
drop policy if exists "admins and ED read the audit log" on public.records_audit;
create policy "admins and ED read the audit log" on public.records_audit for select using (public.i_am_admin() or public.my_role() = 'ED');
revoke all on public.records_audit from anon, authenticated;
grant select on public.records_audit to authenticated;

-- ---------- Helpers ----------
-- The signed-in person's own signature file.
create or replace function public.my_sig() returns text language sql stable security definer set search_path = public as $$
  select data->>'fileId' from public.records where collection = 'signatures' and id = auth.uid()::text
$$;
-- A number from a JSON value, or 0.
create or replace function public.num(v jsonb) returns numeric language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
              when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (v #>> '{}')::numeric
              else 0 end
$$;
-- True when array a starts with every item of array b (a record's history may only grow).
create or replace function public.starts_with(a jsonb, b jsonb) returns boolean language sql immutable as $$
  select coalesce(jsonb_array_length(b), 0) = 0
      or (jsonb_typeof(a) = 'array' and jsonb_array_length(a) >= jsonb_array_length(b)
          and (select bool_and(a -> i = b -> i) from generate_series(0, jsonb_array_length(b) - 1) as i))
$$;
-- Keys added to, changed in, or removed from a JSON object (used for signature maps).
create or replace function public.keys_added(o jsonb, n jsonb) returns setof text language sql immutable as $$
  select k from jsonb_object_keys(coalesce(n, '{}'::jsonb)) as k where not coalesce(o, '{}'::jsonb) ? k
$$;
create or replace function public.keys_changed(o jsonb, n jsonb) returns setof text language sql immutable as $$
  select k from jsonb_object_keys(coalesce(o, '{}'::jsonb)) as k where coalesce(n, '{}'::jsonb) ? k and o -> k is distinct from n -> k
$$;
create or replace function public.keys_removed(o jsonb, n jsonb) returns setof text language sql immutable as $$
  select k from jsonb_object_keys(coalesce(o, '{}'::jsonb)) as k where not coalesce(n, '{}'::jsonb) ? k
$$;

-- Vendor bank details live in their own collection, readable only by Procurement, Finance, the Project Manager and the ED.
create or replace function public.can_access(col text, rid text, owner uuid, writing boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() is null then false
    when col = 'signatures' then rid = auth.uid()::text
    when col in ('hrstaff', 'hrleave', 'timesheets', 'appraisals')
      then public.my_role() in ('HR', 'ED') or (owner = auth.uid() and (not writing or col in ('hrleave', 'timesheets', 'appraisals')))
    when col = 'vendor_bank'
      then public.my_role() in ('Logistics', 'Finance', 'ED', 'PM') and (not writing or public.my_role() in ('Logistics', 'Finance'))
    when col = 'settings' then not writing or public.my_role() <> 'Staff'
    else public.my_role() <> 'Staff'
  end
$$;

-- ---------- The guard: checks every insert, change and delete ----------
create or replace function public.records_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r text := public.my_role();
  sig text := public.my_sig();
  col text := coalesce(new.collection, old.collection);
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then old.data end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then new.data end;
  os text := o ->> 'stage';
  ns text := n ->> 'stage';
  ost text := o ->> 'status';
  nst text := n ->> 'status';
  k text;
  who text;
  ed_limit numeric := 5000000;
begin
  -- Maintenance from the Supabase dashboard (no signed-in Hub user) is allowed.
  if me is null then
    if tg_op <> 'DELETE' then new.updated_at := now(); end if;
    return coalesce(new, old);
  end if;
  if r is null then raise exception 'Your account is not approved yet.'; end if;

  if tg_op = 'DELETE' then
    if col in ('vendors', 'vendor_bank') and (r = 'Logistics' or public.i_am_admin()) then return old; end if;
    if public.i_am_admin() and col in ('documents', 'settings') then return old; end if;
    raise exception 'This record cannot be deleted.';
  end if;

  new.updated_at := now();
  new.updated_by := me;

  -- A record's history only ever grows.
  if tg_op = 'UPDATE' and o ? 'log' and not public.starts_with(n -> 'log', o -> 'log') then
    raise exception 'The history of a record cannot be changed.';
  end if;

  ---------------- Purchase requests ----------------
  if col = 'requests' then
    if tg_op = 'INSERT' then
      if coalesce(ns, '') <> 'Requested' or coalesce(n -> 'sigs', '{}'::jsonb) <> '{}'::jsonb then
        raise exception 'A new purchase request must start as Requested, with no signatures.';
      end if;
      return new;
    end if;
    if exists (select public.keys_changed(o -> 'sigs', n -> 'sigs')) or exists (select public.keys_removed(o -> 'sigs', n -> 'sigs')) then
      raise exception 'Signatures on a request cannot be changed or removed.';
    end if;
    for k in select public.keys_added(o -> 'sigs', n -> 'sigs') loop
      who := split_part(k, '-', 2);
      if sig is null or n -> 'sigs' ->> k is distinct from sig then raise exception 'You can only sign with your own signature.'; end if;
      if who <> r then raise exception 'You can only sign as your own role (%).', r; end if;
      if split_part(k, '-', 1) = 'PR' then
        if os <> 'Requested' then raise exception 'The PR can only be signed while it is waiting for approval.'; end if;
        if r in ('Finance', 'Logistics') and not (o -> 'sigs' ? 'PR-PM') then raise exception 'The Project Manager must approve first.'; end if;
        if r not in ('PM', 'Finance', 'Logistics', 'ED') then raise exception 'Your role does not approve purchase requests.'; end if;
      elsif split_part(k, '-', 1) = 'PO' then
        if os <> 'PO pending' then raise exception 'The PO can only be signed while it is waiting for approval.'; end if;
        if r not in ('Finance', 'Logistics', 'ED') then raise exception 'Your role does not approve POs.'; end if;
      else
        raise exception 'Unknown signature box.';
      end if;
    end loop;
    -- Fields fixed once the request exists (PO details only change when the PO is uploaded).
    if (n -> 'no', n -> 'est', n -> 'prf', n -> 'by') is distinct from (o -> 'no', o -> 'est', o -> 'prf', o -> 'by') then
      raise exception 'The request number, estimate, requester and PR form cannot be changed.';
    end if;
    if not (os = 'Approved' and ns = 'PO pending')
       and (n -> 'po', n -> 'pof', n -> 'amount', n -> 'vendor') is distinct from (o -> 'po', o -> 'pof', o -> 'amount', o -> 'vendor') then
      raise exception 'PO details can only be set when the PO is uploaded.';
    end if;
    if os is distinct from ns then
      if os = 'Requested' and ns = 'Approved' then
        if not (n -> 'sigs' ?& array['PR-PM', 'PR-Finance', 'PR-Logistics']) or (public.num(o -> 'est') >= ed_limit and not (n -> 'sigs' ? 'PR-ED')) then
          raise exception 'The request still needs signatures before it is approved.';
        end if;
      elsif os = 'Requested' and ns = 'Rejected' then
        if r not in ('PM', 'Finance', 'Logistics', 'ED') then raise exception 'Your role cannot reject requests.'; end if;
      elsif os = 'Approved' and ns = 'PO pending' then
        if r <> 'Logistics' or n -> 'pof' is null then raise exception 'Only Procurement uploads the PO.'; end if;
      elsif os = 'PO pending' and ns = 'Ordered' then
        if not (n -> 'sigs' ?& array['PO-Finance', 'PO-Logistics']) or (public.num(n -> 'amount') >= ed_limit and not (n -> 'sigs' ? 'PO-ED')) then
          raise exception 'The PO still needs signatures before it is ordered.';
        end if;
      elsif os = 'PO pending' and ns = 'Rejected' then
        if r not in ('Finance', 'Logistics', 'ED') then raise exception 'Your role cannot reject POs.'; end if;
      elsif os = 'Ordered' and ns = 'Received' then
        if r <> 'Logistics' then raise exception 'Only Procurement marks goods received.'; end if;
      elsif os in ('Ordered', 'Received') and ns = 'Paid' then
        if r <> 'Finance' then raise exception 'Only Finance marks a request paid.'; end if;
      else
        raise exception 'A request cannot go from % to %.', os, ns;
      end if;
    end if;
    return new;
  end if;

  ---------------- Payments (RFP then PV) ----------------
  if col = 'payments' then
    if tg_op = 'INSERT' then
      if coalesce(ns, '') <> 'RFP pending' or (select array_agg(x) from jsonb_object_keys(coalesce(n -> 'sigs', '{}'::jsonb)) x) is distinct from array['RFP-req']
         or n -> 'sigs' ->> 'RFP-req' is distinct from sig then
        raise exception 'A new RFP must start as RFP pending, signed by the person raising it.';
      end if;
      return new;
    end if;
    if exists (select public.keys_changed(o -> 'sigs', n -> 'sigs')) then raise exception 'Signatures on a payment cannot be changed.'; end if;
    for k in select public.keys_removed(o -> 'sigs', n -> 'sigs') loop
      -- Only a rejected PV is cleared, so Finance can prepare a new one.
      if not (os = 'PV pending' and ns = 'RFP approved' and k like 'PV-%' and r in ('PM', 'ED')) then
        raise exception 'Signatures on a payment cannot be removed.';
      end if;
    end loop;
    for k in select public.keys_added(o -> 'sigs', n -> 'sigs') loop
      if sig is null or n -> 'sigs' ->> k is distinct from sig then raise exception 'You can only sign with your own signature.'; end if;
      if k = 'RFP-chk' then
        if not (r = 'PM' and os = 'RFP pending' and o -> 'sigs' ? 'RFP-req') then raise exception 'Only the Project Manager checks the RFP.'; end if;
      elsif k = 'RFP-apr' then
        if not (r = 'ED' and os = 'RFP pending' and o -> 'sigs' ? 'RFP-chk') then raise exception 'Only the ED approves the RFP, after it is checked.'; end if;
      elsif k = 'PV-prep' then
        if not (r = 'Finance' and os = 'RFP approved' and ns = 'PV pending') then raise exception 'Only Finance prepares the PV, after the RFP is approved.'; end if;
      elsif k = 'PV-chk' then
        if not (r = 'PM' and os = 'PV pending') then raise exception 'Only the Project Manager checks the PV.'; end if;
      elsif k = 'PV-apr' then
        if not (r = 'ED' and os = 'PV pending' and o -> 'sigs' ? 'PV-chk') then raise exception 'Only the ED approves the PV, after it is checked.'; end if;
      else
        raise exception 'Unknown signature box.';
      end if;
    end loop;
    if (n -> 'ref', n -> 'amount', n -> 'rfpFile', n -> 'requestId', n -> 'requester') is distinct from (o -> 'ref', o -> 'amount', o -> 'rfpFile', o -> 'requestId', o -> 'requester') then
      raise exception 'The RFP reference, amount, requester and form cannot be changed.';
    end if;
    if n -> 'pv' is distinct from o -> 'pv' and not ((os = 'RFP approved' and ns = 'PV pending') or (os = 'PV pending' and ns = 'RFP approved')) then
      raise exception 'The PV can only be set when Finance prepares it.';
    end if;
    if os is distinct from ns then
      if os = 'RFP pending' and ns = 'RFP approved' then
        if not (n -> 'sigs' ?& array['RFP-req', 'RFP-chk', 'RFP-apr']) then raise exception 'The RFP still needs signatures.'; end if;
      elsif os = 'RFP pending' and ns = 'Rejected' then
        if r not in ('PM', 'ED') then raise exception 'Only the Project Manager or ED rejects an RFP.'; end if;
      elsif os = 'RFP approved' and ns = 'PV pending' then
        if r <> 'Finance' or n -> 'pv' is null or jsonb_typeof(n -> 'pv') = 'null' then raise exception 'Only Finance prepares the PV.'; end if;
      elsif os = 'PV pending' and ns = 'PV approved' then
        if not (n -> 'sigs' ?& array['PV-prep', 'PV-chk', 'PV-apr']) then raise exception 'The PV still needs signatures.'; end if;
      elsif os = 'PV pending' and ns = 'RFP approved' then
        if r not in ('PM', 'ED') then raise exception 'Only the Project Manager or ED rejects a PV.'; end if;
      elsif os = 'PV approved' and ns = 'Paid' then
        if r <> 'Finance' then raise exception 'Only Finance marks a payment paid.'; end if;
      else
        raise exception 'A payment cannot go from % to %.', os, ns;
      end if;
    end if;
    return new;
  end if;

  ---------------- Documents ----------------
  if col = 'documents' then
    if tg_op = 'INSERT' then
      if coalesce(n -> 'signed', '{}'::jsonb) <> '{}'::jsonb then raise exception 'A new document cannot already be signed.'; end if;
      return new;
    end if;
    if (n -> 'title', n -> 'signers', n -> 'by', n -> 'date', n -> 'dept', n -> 'files') is distinct from (o -> 'title', o -> 'signers', o -> 'by', o -> 'date', o -> 'dept', o -> 'files') then
      raise exception 'A document cannot be changed after it is uploaded, only signed.';
    end if;
    if exists (select public.keys_changed(o -> 'signed', n -> 'signed')) or exists (select public.keys_removed(o -> 'signed', n -> 'signed')) then
      raise exception 'Signatures on a document cannot be changed or removed.';
    end if;
    for k in select public.keys_added(o -> 'signed', n -> 'signed') loop
      if k <> r then raise exception 'You can only sign as your own role (%).', r; end if;
      if sig is null or n -> 'signed' ->> k is distinct from sig then raise exception 'You can only sign with your own signature.'; end if;
      if not (o -> 'signers' ? r or r = 'ED') then raise exception 'Your role is not asked to sign this document.'; end if;
    end loop;
    return new;
  end if;

  ---------------- Leave ----------------
  -- The LEAVE REQUEST FORM: the employee signs it (or HR logs it for them), then HR approves or rejects and signs.
  -- The supervisor's box is signed by hand on the printed form. Requests logged before the form were "Pending".
  if col = 'hrleave' then
    if tg_op = 'INSERT' then
      if coalesce(nst, '') <> 'Pending HR' then raise exception 'A new leave request goes to HR.'; end if;
      if exists (select 1 from jsonb_object_keys(coalesce(n -> 'sigs', '{}'::jsonb)) as k where k <> 'Employee') then
        raise exception 'A new leave request can only carry the employee''s signature.';
      end if;
      if n -> 'sigs' ? 'Employee' and (sig is null or n -> 'sigs' ->> 'Employee' is distinct from sig) then
        raise exception 'You can only sign a leave request with your own signature.';
      end if;
      if r not in ('HR', 'ED') and not (n -> 'sigs' ? 'Employee') then raise exception 'Sign your leave request before sending it.'; end if;
      if n ? 'decisions' then raise exception 'A new leave request cannot already be decided.'; end if;
      return new;
    end if;
    if r <> 'HR' then raise exception 'Only HR approves or rejects leave.'; end if;
    if (n - 'status' - 'sigs' - 'decisions' - 'log') is distinct from (o - 'status' - 'sigs' - 'decisions' - 'log') then
      raise exception 'A leave request cannot be changed after it is sent, only approved or rejected.';
    end if;
    if exists (select public.keys_changed(o -> 'sigs', n -> 'sigs')) or exists (select public.keys_removed(o -> 'sigs', n -> 'sigs')) then
      raise exception 'Signatures on leave cannot be changed or removed.';
    end if;
    if (n -> 'decisions') - 'HR' is distinct from coalesce(o -> 'decisions', '{}'::jsonb) - 'HR' then
      raise exception 'The supervisor''s decision is filled in by hand on the printed form.';
    end if;
    if ost not in ('Pending', 'Pending supervisor', 'Pending HR') or nst not in ('Approved', 'Rejected') then
      raise exception 'This leave request has already been decided.';
    end if;
    for k in select public.keys_added(o -> 'sigs', n -> 'sigs') loop
      if not (k = 'HR' and nst = 'Approved') then raise exception 'HR signs leave when approving it.'; end if;
      if sig is null or n -> 'sigs' ->> k is distinct from sig then raise exception 'Leave is approved with your own signature.'; end if;
    end loop;
    if nst = 'Approved' and not (n -> 'sigs' ? 'HR') then raise exception 'HR signs when approving leave.'; end if;
    return new;
  end if;

  ---------------- Timesheets ----------------
  if col = 'timesheets' then
    if r not in ('HR', 'ED') then
      -- The staff member's own timesheet: they can only submit or resubmit it.
      if coalesce(nst, '') <> 'Submitted' or n ? 'sig' or n ? 'approvedBy' then raise exception 'You can only submit your timesheet. HR approves it.'; end if;
      if tg_op = 'UPDATE' and ost = 'Approved' then raise exception 'This timesheet is already approved.'; end if;
      return new;
    end if;
    if nst = 'Approved' and (tg_op = 'INSERT' or ost is distinct from 'Approved') then
      if sig is null or n ->> 'sig' is distinct from sig then raise exception 'A timesheet is approved with your own signature.'; end if;
    end if;
    return new;
  end if;

  ---------------- Appraisals ----------------
  if col = 'appraisals' then
    if r not in ('HR', 'ED') then
      -- The staff member can only add their acknowledgement and comment.
      if tg_op = 'INSERT' or (n - 'staffAck' - 'staffUserId' - 'log') is distinct from (o - 'staffAck' - 'staffUserId' - 'log') then
        raise exception 'You can only acknowledge your appraisal.';
      end if;
      return new;
    end if;
    return new;
  end if;

  ---------------- Vendors, bank details, email log ----------------
  if col = 'vendors' then
    if not (r = 'Logistics' or public.i_am_admin()) then raise exception 'Only Procurement manages the vendor list.'; end if;
    if n ?| array['accountNo', 'accountName', 'bankName'] then raise exception 'Bank details are kept in the protected bank records.'; end if;
    return new;
  end if;
  if col = 'vendor_bank' then
    if r not in ('Logistics', 'Finance') then raise exception 'Only Procurement or Finance changes vendor bank details.'; end if;
    return new;
  end if;
  if col = 'emails' then
    if tg_op = 'UPDATE' then raise exception 'The sent-email log cannot be changed.'; end if;
    if not (r = 'Logistics' or public.i_am_admin()) then raise exception 'Only Procurement records vendor emails.'; end if;
    return new;
  end if;

  -- hrstaff, settings and signatures: the access rules above already decide who may write them.
  return new;
end $$;

drop trigger if exists records_guard on public.records;
create trigger records_guard before insert or update or delete on public.records
  for each row execute function public.records_guard();

-- Every change goes into the audit log.
create or replace function public.records_audit_write() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.records_audit (actor, actor_name, actor_role, collection, record_id, action, old_data, new_data)
  values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), public.my_role(),
          coalesce(new.collection, old.collection), coalesce(new.id, old.id), lower(tg_op),
          case when tg_op <> 'INSERT' then old.data end, case when tg_op <> 'DELETE' then new.data end);
  return null;
end $$;
drop trigger if exists records_audit on public.records;
create trigger records_audit after insert or update or delete on public.records
  for each row execute function public.records_audit_write();

-- ---------- Move existing vendor bank details into the protected collection ----------
insert into public.records (collection, id, data, updated_at)
select 'vendor_bank', id,
       jsonb_strip_nulls(jsonb_build_object('id', id, 'bankName', data -> 'bankName', 'accountName', data -> 'accountName', 'accountNo', data -> 'accountNo')),
       now()
from public.records
where collection = 'vendors' and data ?| array['accountNo', 'accountName', 'bankName']
on conflict (collection, id) do update set data = excluded.data;
update public.records set data = data - 'accountNo' - 'accountName' - 'bankName'
where collection = 'vendors' and data ?| array['accountNo', 'accountName', 'bankName'];
