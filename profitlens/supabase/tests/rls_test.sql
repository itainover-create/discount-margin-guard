-- Verifies organization isolation and the role matrix. Any failed assertion aborts with an error.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@a.test', '{"name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@b.test', '{"name":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@a.test', '{"name":"Carol"}');

create schema rlstest;
create function rlstest.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false)
$$;
create function rlstest.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;
-- runs a statement and reports whether it was rejected or affected zero rows
create function rlstest.blocked(stmt text) returns boolean language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    return n = 0;
  exception when insufficient_privilege or check_violation or foreign_key_violation then
    return true;
  end;
end $$;
grant usage on schema rlstest to authenticated, anon;

set role authenticated;

-- Alice and Bob each create a business
select rlstest.login('00000000-0000-0000-0000-00000000000a');
select public.create_organization('Alice AC', 'hvac', 'IL', 'ILS', 'he', '{"vat_rate_bp":1800}', array['התקנה','תיקון']) as org_a \gset
select rlstest.expect(rlstest.blocked($$select public.create_organization('Second', '', 'IL', 'ILS', 'he')$$) is not false, 'a user cannot create a second organization');
insert into public.customers (organization_id, name) values (:'org_a', 'Customer A') returning id as cust_a \gset
insert into public.jobs (organization_id, title, customer_id, quoted_price) values (:'org_a', 'Job A1', :'cust_a', 150000) returning id as job_a \gset
insert into public.jobs (organization_id, title) values (:'org_a', 'Job A2');
insert into public.job_cost_entries (organization_id, job_id, kind, category, amount) values (:'org_a', :'job_a', 'actual', 'materials', 30000);
insert into public.employees (organization_id, name, hourly_cost) values (:'org_a', 'Tech A', 8000) returning id as emp_a \gset
select rlstest.expect((select array_agg(job_number order by job_number) from public.jobs) = array[1, 2], 'job numbers are assigned per organization');
select rlstest.expect((select count(*) from public.service_categories) = 2, 'default categories created');

select rlstest.login('00000000-0000-0000-0000-00000000000b');
select public.create_organization('Bob Plumbing', 'plumbing', 'IL', 'ILS', 'he') as org_b \gset
insert into public.jobs (organization_id, title) values (:'org_b', 'Job B1') returning id as job_b \gset
select rlstest.expect((select job_number from public.jobs where id = :'job_b') = 1, 'numbering restarts for another organization');

-- Bob cannot see or touch Alice's data
select rlstest.expect((select count(*) from public.jobs where organization_id = :'org_a') = 0, 'cross-org: jobs are invisible');
select rlstest.expect((select count(*) from public.customers) = 0, 'cross-org: customers are invisible');
select rlstest.expect((select count(*) from public.job_cost_entries) = 0, 'cross-org: cost entries are invisible');
select rlstest.expect((select count(*) from public.business_settings) = 1, 'cross-org: only own settings are visible');
select rlstest.expect((select count(*) from public.organizations) = 1, 'cross-org: only own organization is visible');
select rlstest.expect((select count(*) from public.users) = 1, 'cross-org: other profiles are invisible');
select rlstest.expect(rlstest.blocked(format($$update public.jobs set title = 'hacked' where id = %L$$, :'job_a')), 'cross-org: update is blocked');
select rlstest.expect(rlstest.blocked(format($$delete from public.jobs where id = %L$$, :'job_a')), 'cross-org: delete is blocked');
select rlstest.expect(rlstest.blocked(format($$insert into public.jobs (organization_id, title) values (%L, 'intruder')$$, :'org_a')), 'cross-org: insert is blocked');
select rlstest.expect(rlstest.blocked(format($$insert into public.job_cost_entries (organization_id, job_id, kind, category, amount) values (%L, %L, 'actual', 'other', 1)$$, :'org_b', :'job_a')), 'cross-org: cost entry cannot attach to a foreign job');
select rlstest.expect(rlstest.blocked(format($$update public.jobs set customer_id = %L where id = %L$$, :'cust_a', :'job_b')), 'cross-org: job cannot reference a foreign customer');
select rlstest.expect(rlstest.blocked(format($$update public.business_settings set vat_rate_bp = 0 where organization_id = %L$$, :'org_a')), 'cross-org: settings update is blocked');
select rlstest.expect(rlstest.blocked(format($$delete from public.organizations where id = %L$$, :'org_a')), 'cross-org: organization delete is blocked');
select rlstest.expect(rlstest.blocked(format($$insert into public.organization_members (organization_id, user_id, role) values (%L, auth.uid(), 'owner')$$, :'org_a')), 'cross-org: cannot self-insert a membership');

-- Alice invites Carol as a team member
select rlstest.login('00000000-0000-0000-0000-00000000000a');
insert into public.organization_invites (organization_id, email, role) values (:'org_a', 'carol@a.test', 'member');
select rlstest.login('00000000-0000-0000-0000-00000000000c');
select rlstest.expect(public.accept_pending_invite() = :'org_a', 'invited e-mail joins the organization');
select rlstest.expect(public.org_role(:'org_a') = 'member', 'invitee has the invited role');

-- team member permissions
select rlstest.expect((select count(*) from public.jobs) = 2, 'member: reads jobs');
select rlstest.expect(not rlstest.blocked(format($$update public.jobs set notes = 'on site' where id = %L$$, :'job_a')), 'member: updates jobs');
select rlstest.expect(not rlstest.blocked(format($$insert into public.job_cost_entries (organization_id, job_id, kind, category, amount) values (%L, %L, 'actual', 'transport', 5000)$$, :'org_a', :'job_a')), 'member: records costs');
select rlstest.expect(rlstest.blocked(format($$delete from public.jobs where id = %L$$, :'job_a')), 'member: cannot delete jobs');
select rlstest.expect(rlstest.blocked(format($$delete from public.customers where id = %L$$, :'cust_a')), 'member: cannot delete customers');
select rlstest.expect(rlstest.blocked(format($$update public.business_settings set vat_rate_bp = 0 where organization_id = %L$$, :'org_a')), 'member: cannot change settings');
select rlstest.expect(rlstest.blocked(format($$update public.employees set hourly_cost = 1 where id = %L$$, :'emp_a')), 'member: cannot edit employees');
select rlstest.expect(rlstest.blocked(format($$insert into public.organization_invites (organization_id, email, role) values (%L, 'x@x.test', 'admin')$$, :'org_a')), 'member: cannot invite');
select rlstest.expect(rlstest.blocked($$update public.organization_members set role = 'admin' where user_id = auth.uid()$$), 'member: cannot promote themselves');
select rlstest.expect(rlstest.blocked(format($$delete from public.organizations where id = %L$$, :'org_a')), 'member: cannot delete the business');
select rlstest.expect((select count(*) from public.activity_logs) = 0, 'member: cannot read the activity log');
select rlstest.expect((select count(*) from public.users) = 2, 'member: sees profiles of own organization only');

-- owner protections and cascade
select rlstest.login('00000000-0000-0000-0000-00000000000a');
select rlstest.expect(rlstest.blocked($$update public.organization_members set role = 'member' where role = 'owner'$$), 'owner row cannot be demoted');
select rlstest.expect(rlstest.blocked($$update public.organization_members set role = 'owner' where role = 'member'$$), 'nobody can be made a second owner');
select rlstest.expect(not rlstest.blocked($$update public.organization_members set role = 'admin' where role = 'member'$$), 'owner promotes a member to admin');
delete from public.customers where id = :'cust_a';
select rlstest.expect((select customer_id is null and organization_id is not null from public.jobs where id = :'job_a'), 'deleting a customer keeps the job');
delete from public.jobs where id = :'job_a';
select rlstest.expect((select count(*) from public.job_cost_entries) = 0, 'deleting a job removes its cost entries');
delete from public.organizations where id = :'org_a';
select rlstest.expect((select count(*) from public.organizations) = 0, 'owner deletes the business');

reset role;
select rlstest.expect((select count(*) from public.jobs where organization_id = :'org_a') = 0, 'business deletion cascades to all records');
select rlstest.expect((select count(*) from public.jobs) = 1, 'the other organization is untouched');

-- anonymous visitors get nothing
set role anon;
select rlstest.login('');
select rlstest.expect(rlstest.blocked($$select * from public.jobs$$), 'anon: no access to jobs');
reset role;
\echo ALL RLS TESTS PASSED
