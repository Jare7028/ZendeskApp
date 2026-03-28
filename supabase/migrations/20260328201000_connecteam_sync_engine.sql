alter table app.connecteam_connections
  add column if not exists sync_status text not null default 'idle'
    check (sync_status in ('idle', 'running', 'error')),
  add column if not exists sync_lock_expires_at timestamptz,
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_completed_at timestamptz,
  add column if not exists last_sync_status text
    check (last_sync_status in ('succeeded', 'failed', 'partial')),
  add column if not exists last_sync_error text,
  add column if not exists users_synced_at timestamptz,
  add column if not exists shifts_synced_through timestamptz;

create table if not exists app.connecteam_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  connecteam_connection_id uuid not null references app.connecteam_connections (id) on delete cascade,
  connecteam_user_id text not null,
  email text,
  first_name text,
  last_name text,
  full_name text,
  status text,
  raw_payload jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default timezone('utc', now()),
  unique (connecteam_connection_id, connecteam_user_id)
);

create table if not exists app.connecteam_sync_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  connecteam_connection_id uuid not null references app.connecteam_connections (id) on delete cascade,
  trigger_source text not null check (trigger_source in ('cron', 'manual')),
  sync_mode text not null check (sync_mode in ('incremental')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'partial')),
  counts jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  error_message text
);

create index if not exists connecteam_sync_runs_connection_started_idx
  on app.connecteam_sync_runs (connecteam_connection_id, started_at desc);

create table if not exists app.connecteam_shifts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  connecteam_connection_id uuid not null references app.connecteam_connections (id) on delete cascade,
  connecteam_user_id text not null,
  connecteam_shift_id text not null,
  scheduler_id text not null,
  scheduler_name text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  shift_date date not null,
  scheduled_minutes integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default timezone('utc', now()),
  unique (connecteam_connection_id, connecteam_shift_id, connecteam_user_id)
);

create index if not exists connecteam_shifts_connection_user_date_idx
  on app.connecteam_shifts (connecteam_connection_id, connecteam_user_id, shift_date);

create table if not exists app.connecteam_daily_schedules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  connecteam_connection_id uuid not null references app.connecteam_connections (id) on delete cascade,
  connecteam_user_id text not null,
  work_date date not null,
  scheduled_minutes integer not null default 0,
  shift_count integer not null default 0,
  source_updated_at timestamptz not null default timezone('utc', now()),
  raw_payload jsonb not null default '{}'::jsonb,
  unique (connecteam_connection_id, connecteam_user_id, work_date)
);

alter table app.agent_mappings
  add column if not exists zendesk_agent_name text,
  add column if not exists connecteam_user_name text,
  add column if not exists match_source text not null default 'auto'
    check (match_source in ('auto', 'manual', 'unmatched')),
  add column if not exists manual_override boolean not null default false,
  add column if not exists matched_at timestamptz;

create unique index if not exists agent_mappings_unique_zendesk_agent_idx
  on app.agent_mappings (client_id, zendesk_connection_id, zendesk_agent_id)
  where zendesk_connection_id is not null and zendesk_agent_id is not null;

create unique index if not exists agent_mappings_unique_connecteam_user_idx
  on app.agent_mappings (client_id, connecteam_connection_id, connecteam_user_id)
  where connecteam_connection_id is not null and connecteam_user_id is not null;

alter table app.connecteam_users enable row level security;
alter table app.connecteam_sync_runs enable row level security;
alter table app.connecteam_shifts enable row level security;
alter table app.connecteam_daily_schedules enable row level security;

create policy "admins manage connecteam users"
on app.connecteam_users
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read connecteam users by client access"
on app.connecteam_users
for select
using (app.can_read_client(client_id));

create policy "admins manage connecteam sync runs"
on app.connecteam_sync_runs
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read connecteam sync runs by client access"
on app.connecteam_sync_runs
for select
using (app.can_read_client(client_id));

create policy "admins manage connecteam shifts"
on app.connecteam_shifts
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read connecteam shifts by client access"
on app.connecteam_shifts
for select
using (app.can_read_client(client_id));

create policy "admins manage connecteam daily schedules"
on app.connecteam_daily_schedules
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read connecteam daily schedules by client access"
on app.connecteam_daily_schedules
for select
using (app.can_read_client(client_id));

grant select on app.connecteam_users to authenticated;
grant select on app.connecteam_sync_runs to authenticated;
grant select on app.connecteam_shifts to authenticated;
grant select on app.connecteam_daily_schedules to authenticated;
grant all on app.connecteam_users to service_role;
grant all on app.connecteam_sync_runs to service_role;
grant all on app.connecteam_shifts to service_role;
grant all on app.connecteam_daily_schedules to service_role;
