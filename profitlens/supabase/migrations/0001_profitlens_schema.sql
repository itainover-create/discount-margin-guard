-- ProfitLens — database schema, constraints and Row Level Security.
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- Conventions
--   * Money columns are BIGINT minor units (agorot). Rates are INTEGER basis points (18% = 1800).
--   * Every business record carries organization_id; RLS isolates organizations from each other.
--   * Role matrix (mirrors src/lib/permissions.ts):
--       owner/admin : full access to the organization's records
--       member      : read operational data; create/update jobs, customers and cost entries;
--                     delete cost entries only; no settings, team or invitation access.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name)
  values (new.id, lower(coalesce(new.email, '')), left(coalesce(new.raw_user_meta_data ->> 'name', ''), 80))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- organizations

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  business_type text not null default '',
  country text not null default 'IL',
  currency text not null default 'ILS' check (char_length(currency) = 3),
  language text not null default 'he',
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index organization_invites_email_idx on public.organization_invites (email);

create table public.business_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  vat_rate_bp integer not null default 1800 check (vat_rate_bp between 0 and 10000),
  vat_mode text not null default 'added' check (vat_mode in ('added', 'included', 'none')),
  default_hourly_cost bigint not null default 0 check (default_hourly_cost >= 0),
  target_margin_bp integer not null default 3000 check (target_margin_bp between 0 and 9999),
  overhead_method text not null default 'none' check (overhead_method in ('none', 'fixed', 'hours', 'revenue_pct')),
  monthly_overhead bigint not null default 0 check (monthly_overhead >= 0),
  billable_hours numeric(10, 3) not null default 0 check (billable_hours >= 0),
  fixed_overhead_per_job bigint not null default 0 check (fixed_overhead_per_job >= 0),
  overhead_revenue_pct_bp integer not null default 0 check (overhead_revenue_pct_bp between 0 and 10000),
  payment_fee_bp integer not null default 0 check (payment_fee_bp between 0 and 2000),
  date_format text not null default 'dd/MM/yyyy' check (date_format in ('dd/MM/yyyy', 'dd.MM.yyyy', 'yyyy-MM-dd')),
  dashboard_range text not null default 'this_month',
  onboarded boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- business records

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  business_name text,
  phone text,
  email text,
  notes text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  hourly_cost bigint not null default 0 check (hourly_cost >= 0),
  active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_number integer not null,
  title text not null check (char_length(title) between 1 and 160),
  customer_id uuid,
  service_category_id uuid,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'quoted', 'approved', 'in_progress', 'completed', 'cancelled')),
  planned_date date,
  completed_date date,
  quoted_price bigint check (quoted_price >= 0),
  final_price bigint check (final_price >= 0),
  vat_mode text not null default 'added' check (vat_mode in ('added', 'included', 'none')),
  vat_rate_bp integer not null default 1800 check (vat_rate_bp between 0 and 10000),
  payment_fee_bp integer not null default 0 check (payment_fee_bp between 0 and 2000),
  notes text,
  archived boolean not null default false,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, job_number),
  -- Composite keys guarantee a job can only reference records of its own organization.
  foreign key (organization_id, customer_id) references public.customers (organization_id, id)
    on delete set null (customer_id),
  foreign key (organization_id, service_category_id) references public.service_categories (organization_id, id)
    on delete set null (service_category_id)
);
create index jobs_org_status_idx on public.jobs (organization_id, status);
create index jobs_org_completed_idx on public.jobs (organization_id, completed_date);
create index jobs_customer_idx on public.jobs (organization_id, customer_id);

create table public.job_cost_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null,
  kind text not null check (kind in ('estimated', 'actual')),
  category text not null check (category in ('materials', 'labor', 'transport', 'contractor', 'other')),
  description text not null default '',
  quantity numeric(12, 3) check (quantity >= 0),
  unit text,
  unit_cost bigint check (unit_cost >= 0),
  employee_id uuid,
  hours numeric(10, 3) check (hours >= 0),
  hourly_cost bigint check (hourly_cost >= 0),
  distance_km numeric(10, 3) check (distance_km >= 0),
  rate_per_km bigint check (rate_per_km >= 0),
  parking bigint check (parking >= 0),
  other_travel bigint check (other_travel >= 0),
  amount bigint not null check (amount >= 0),
  entry_date date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (organization_id, job_id) references public.jobs (organization_id, id) on delete cascade,
  foreign key (organization_id, employee_id) references public.employees (organization_id, id)
    on delete set null (employee_id)
);
create index job_cost_entries_job_idx on public.job_cost_entries (organization_id, job_id);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  summary text not null default '',
  created_at timestamptz not null default now()
);
create index activity_logs_org_idx on public.activity_logs (organization_id, created_at desc);

-- ---------------------------------------------------------------- triggers

create function public.set_job_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Serialise numbering per organization so two concurrent inserts cannot collide.
    perform 1 from public.organizations where id = new.organization_id for update;
    select coalesce(max(job_number), 0) + 1 into new.job_number
    from public.jobs where organization_id = new.organization_id;
  else
    new.job_number := old.job_number;
    new.organization_id := old.organization_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger jobs_defaults before insert or update on public.jobs
for each row execute function public.set_job_defaults();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger business_settings_touch before update on public.business_settings
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- authorization helpers

create function public.org_role(org uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.organization_members
  where organization_id = org and user_id = auth.uid()
$$;

create function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.org_role(org) is not null
$$;

create function public.is_org_manager(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.org_role(org) in ('owner', 'admin'), false)
$$;

create function public.shares_org_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members mine
    join public.organization_members theirs using (organization_id)
    where mine.user_id = auth.uid() and theirs.user_id = other
  )
$$;

-- ---------------------------------------------------------------- RPCs

-- Creates a business with its owner membership, settings and default service categories atomically.
create function public.create_organization(
  p_name text, p_business_type text, p_country text, p_currency text, p_language text,
  p_settings jsonb default '{}'::jsonb, p_categories text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members where user_id = auth.uid()) then
    raise exception 'user already belongs to an organization' using errcode = '42501';
  end if;

  insert into public.organizations (name, business_type, country, currency, language)
  values (p_name, coalesce(p_business_type, ''), coalesce(p_country, 'IL'), coalesce(p_currency, 'ILS'), coalesce(p_language, 'he'))
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role) values (v_org, auth.uid(), 'owner');

  insert into public.business_settings (
    organization_id, vat_rate_bp, vat_mode, default_hourly_cost, target_margin_bp, overhead_method,
    monthly_overhead, billable_hours, fixed_overhead_per_job, overhead_revenue_pct_bp, payment_fee_bp
  ) values (
    v_org,
    coalesce((p_settings ->> 'vat_rate_bp')::integer, 1800),
    coalesce(p_settings ->> 'vat_mode', 'added'),
    coalesce((p_settings ->> 'default_hourly_cost')::bigint, 0),
    coalesce((p_settings ->> 'target_margin_bp')::integer, 3000),
    coalesce(p_settings ->> 'overhead_method', 'none'),
    coalesce((p_settings ->> 'monthly_overhead')::bigint, 0),
    coalesce((p_settings ->> 'billable_hours')::numeric, 0),
    coalesce((p_settings ->> 'fixed_overhead_per_job')::bigint, 0),
    coalesce((p_settings ->> 'overhead_revenue_pct_bp')::integer, 0),
    coalesce((p_settings ->> 'payment_fee_bp')::integer, 0)
  );

  foreach v_name in array coalesce(p_categories, '{}') loop
    insert into public.service_categories (organization_id, name) values (v_org, left(v_name, 80));
  end loop;

  return v_org;
end $$;

-- Joins the caller to the organization that invited their e-mail address, if any.
-- NOTE: this trusts the account's e-mail, so keep "Confirm email" enabled in Supabase Auth.
create function public.accept_pending_invite() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.organization_invites;
  v_email text;
begin
  if auth.uid() is null then
    return null;
  end if;
  if exists (select 1 from public.organization_members where user_id = auth.uid()) then
    return null;
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    return null;
  end if;
  select * into v_invite from public.organization_invites where email = v_email order by created_at limit 1;
  if v_invite.id is null then
    return null;
  end if;
  insert into public.organization_members (organization_id, user_id, role)
  values (v_invite.organization_id, auth.uid(), v_invite.role);
  delete from public.organization_invites where id = v_invite.id;
  return v_invite.organization_id;
end $$;

revoke all on function public.create_organization(text, text, text, text, text, jsonb, text[]) from public, anon;
revoke all on function public.accept_pending_invite() from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, jsonb, text[]) to authenticated;
grant execute on function public.accept_pending_invite() to authenticated;

-- ---------------------------------------------------------------- Row Level Security

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.business_settings enable row level security;
alter table public.customers enable row level security;
alter table public.employees enable row level security;
alter table public.service_categories enable row level security;
alter table public.jobs enable row level security;
alter table public.job_cost_entries enable row level security;
alter table public.activity_logs enable row level security;

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- profiles: yourself, or people in your organization
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));
create policy users_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- the e-mail column is maintained by the auth trigger only
revoke update on public.users from authenticated;
grant update (name) on public.users to authenticated;

-- organizations: created only through create_organization()
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_org_manager(id)) with check (public.is_org_manager(id));
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.org_role(id) = 'owner');

-- memberships: added only through the RPCs; the owner row is immutable
create policy members_select on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id));
create policy members_update on public.organization_members for update to authenticated
  using (public.is_org_manager(organization_id) and role <> 'owner')
  with check (public.is_org_manager(organization_id) and role in ('admin', 'member'));
create policy members_delete on public.organization_members for delete to authenticated
  using (public.is_org_manager(organization_id) and role <> 'owner');
revoke insert on public.organization_members from authenticated;
revoke update on public.organization_members from authenticated;
grant update (role) on public.organization_members to authenticated;

create policy invites_all on public.organization_invites for all to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));

create policy settings_select on public.business_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy settings_update on public.business_settings for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));
revoke insert, delete on public.business_settings from authenticated;

-- customers
create policy customers_select on public.customers for select to authenticated
  using (public.is_org_member(organization_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy customers_update on public.customers for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy customers_delete on public.customers for delete to authenticated
  using (public.is_org_manager(organization_id));

-- jobs
create policy jobs_select on public.jobs for select to authenticated
  using (public.is_org_member(organization_id));
create policy jobs_insert on public.jobs for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy jobs_update on public.jobs for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy jobs_delete on public.jobs for delete to authenticated
  using (public.is_org_manager(organization_id));

-- cost entries
create policy cost_entries_all on public.job_cost_entries for all to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

-- employees and service categories: everyone reads, managers write
create policy employees_select on public.employees for select to authenticated
  using (public.is_org_member(organization_id));
create policy employees_insert on public.employees for insert to authenticated
  with check (public.is_org_manager(organization_id));
create policy employees_update on public.employees for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));
create policy employees_delete on public.employees for delete to authenticated
  using (public.is_org_manager(organization_id));

create policy categories_select on public.service_categories for select to authenticated
  using (public.is_org_member(organization_id));
create policy categories_insert on public.service_categories for insert to authenticated
  with check (public.is_org_manager(organization_id));
create policy categories_update on public.service_categories for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));
create policy categories_delete on public.service_categories for delete to authenticated
  using (public.is_org_manager(organization_id));

-- activity log: members append their own actions, managers read; it is never edited
create policy activity_select on public.activity_logs for select to authenticated
  using (public.is_org_manager(organization_id));
create policy activity_insert on public.activity_logs for insert to authenticated
  with check (public.is_org_member(organization_id) and user_id = auth.uid());
revoke update, delete on public.activity_logs from authenticated;
