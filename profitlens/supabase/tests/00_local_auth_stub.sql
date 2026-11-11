-- LOCAL TESTING ONLY. Emulates the minimum of Supabase's auth schema on a plain Postgres
-- so the migration and its RLS policies can be verified without a Supabase project.
-- Never run this against a real Supabase database.
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role authenticated nologin;
create role anon nologin;
grant usage on schema public, auth to authenticated, anon;
