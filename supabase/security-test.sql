-- Tests the server-side rules by acting as a signed-in Hub user. Everything is rolled back at the end
-- (the results are reported in the final error message), so no data or audit entries are left behind.
do $test$
declare
  uid uuid := (select id from public.profiles where approved order by created_at limit 1);
  res text := '';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1. A new request that skips approval.
  begin
    insert into public.records (collection, id, data) values ('requests', 't1', '{"id":"t1","no":"T-1","stage":"Approved","log":[]}');
    res := res || E'\n1 FAIL: request created as Approved';
  exception when others then res := res || E'\n1 ok (refused): ' || sqlerrm; end;

  -- 2. A normal new request.
  begin
    insert into public.records (collection, id, data) values ('requests', 't2', '{"id":"t2","no":"T-2","est":100,"by":"Test","stage":"Requested","log":["created"],"sigs":{}}');
    res := res || E'\n2 ok (allowed): normal request created';
  exception when others then res := res || E'\n2 FAIL: ' || sqlerrm; end;

  -- 3. Signing as another role with someone else''s signature.
  begin
    update public.records set data = jsonb_set(data, '{sigs}', '{"PR-PM":"fake-file"}') where collection = 'requests' and id = 't2';
    res := res || E'\n3 FAIL: forged PM signature accepted';
  exception when others then res := res || E'\n3 ok (refused): ' || sqlerrm; end;

  -- 4. Jumping to Approved without signatures.
  begin
    update public.records set data = jsonb_set(data, '{stage}', '"Approved"') where collection = 'requests' and id = 't2';
    res := res || E'\n4 FAIL: approved without signatures';
  exception when others then res := res || E'\n4 ok (refused): ' || sqlerrm; end;

  -- 5. Rewriting the history.
  begin
    update public.records set data = jsonb_set(data, '{log}', '[]') where collection = 'requests' and id = 't2';
    res := res || E'\n5 FAIL: history erased';
  exception when others then res := res || E'\n5 ok (refused): ' || sqlerrm; end;

  -- 6. Changing the estimate after the request exists.
  begin
    update public.records set data = jsonb_set(data, '{est}', '1') where collection = 'requests' and id = 't2';
    res := res || E'\n6 FAIL: estimate changed';
  exception when others then res := res || E'\n6 ok (refused): ' || sqlerrm; end;

  -- 7. A payment created as already paid.
  begin
    insert into public.records (collection, id, data) values ('payments', 't3', '{"id":"t3","stage":"Paid","sigs":{}}');
    res := res || E'\n7 FAIL: payment created as Paid';
  exception when others then res := res || E'\n7 ok (refused): ' || sqlerrm; end;

  -- 8. Bank details put back on a vendor record.
  begin
    insert into public.records (collection, id, data) values ('vendors', 't4', '{"id":"t4","name":"Test","accountNo":"0123456789"}');
    res := res || E'\n8 FAIL: bank details stored on vendor';
  exception when others then res := res || E'\n8 ok (refused): ' || sqlerrm; end;

  -- 9. Deleting a purchase request.
  begin
    delete from public.records where collection = 'requests' and id = 't2';
    get diagnostics n = row_count;
    res := res || case when n = 0 then E'\n9 ok (refused): nothing deleted' else E'\n9 FAIL: request deleted' end;
  exception when others then res := res || E'\n9 ok (refused): ' || sqlerrm; end;

  -- 10. Bank details: readable as Procurement, hidden as Program.
  select count(*) into n from public.records where collection = 'vendor_bank';
  res := res || E'\n10a as ' || public.my_role() || ': sees ' || n || ' bank records';
  execute 'reset role';
  update public.profiles set role = 'Program' where id = uid;
  execute 'set local role authenticated';
  select count(*) into n from public.records where collection = 'vendor_bank';
  res := res || E'\n10b as Program: sees ' || n || ' bank records';

  -- 11. A Program user changing a request's stage.
  begin
    update public.records set data = jsonb_set(data, '{stage}', '"Rejected"') where collection = 'requests' and id = 't2';
    res := res || case when found then E'\n11 FAIL: Program rejected a request' else E'\n11 ok (refused): not allowed to change it' end;
  exception when others then res := res || E'\n11 ok (refused): ' || sqlerrm; end;

  -- 12. The audit log recorded the allowed change.
  execute 'reset role';
  select count(*) into n from public.records_audit where record_id = 't2';
  res := res || E'\n12 audit entries for the test request: ' || n;

  raise exception 'TEST RESULTS (all rolled back):%', res;
end
$test$;
