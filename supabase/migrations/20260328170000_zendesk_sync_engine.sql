alter table app.zendesk_connections
  add column if not exists credential_type text not null default 'api_token'
    check (credential_type in ('api_token', 'oauth_token')),
  add column if not exists api_user_email text,
  add column if not exists sync_status text not null default 'idle'
    check (sync_status in ('idle', 'running', 'error')),
  add column if not exists sync_lock_expires_at timestamptz,
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_completed_at timestamptz,
  add column if not exists last_sync_status text
    check (last_sync_status in ('succeeded', 'failed', 'partial')),
  add column if not exists last_sync_error text,
  add column if not exists tickets_synced_through timestamptz,
  add column if not exists ticket_metrics_synced_through timestamptz,
  add column if not exists agents_synced_through timestamptz;

alter table app.tickets
  add column if not exists channel text,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create table if not exists app.zendesk_agents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  zendesk_connection_id uuid not null references app.zendesk_connections (id) on delete cascade,
  zendesk_user_id text not null,
  name text,
  email text,
  role text,
  suspended boolean,
  active boolean,
  last_login_at timestamptz,
  created_at_source timestamptz,
  updated_at_source timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default timezone('utc', now()),
  unique (zendesk_connection_id, zendesk_user_id)
);

create table if not exists app.zendesk_sync_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  zendesk_connection_id uuid not null references app.zendesk_connections (id) on delete cascade,
  trigger_source text not null check (trigger_source in ('cron', 'manual')),
  sync_mode text not null check (sync_mode in ('incremental', 'backfill')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'partial')),
  counts jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  error_message text
);

create index if not exists zendesk_sync_runs_connection_started_idx
  on app.zendesk_sync_runs (zendesk_connection_id, started_at desc);

create table if not exists app.zendesk_backfills (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  zendesk_connection_id uuid not null unique references app.zendesk_connections (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  phase text not null default 'tickets' check (phase in ('tickets', 'ticket_metrics', 'agents', 'completed')),
  tickets_after_cursor text,
  ticket_metrics_after_cursor text,
  agents_after_cursor text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  last_error text,
  progress jsonb not null default jsonb_build_object(
    'tickets', 0,
    'ticket_metrics', 0,
    'agents', 0
  ),
  last_run_id uuid references app.zendesk_sync_runs (id) on delete set null
);

create or replace function app.set_backfill_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists zendesk_backfills_set_updated_at on app.zendesk_backfills;
create trigger zendesk_backfills_set_updated_at
  before update on app.zendesk_backfills
  for each row execute procedure app.set_backfill_updated_at();

alter table app.zendesk_agents enable row level security;
alter table app.zendesk_sync_runs enable row level security;
alter table app.zendesk_backfills enable row level security;

create policy "admins manage zendesk agents"
on app.zendesk_agents
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read zendesk agents by client access"
on app.zendesk_agents
for select
using (app.can_read_client(client_id));

create policy "admins manage zendesk sync runs"
on app.zendesk_sync_runs
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read zendesk sync runs by client access"
on app.zendesk_sync_runs
for select
using (app.can_read_client(client_id));

create policy "admins manage zendesk backfills"
on app.zendesk_backfills
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read zendesk backfills by client access"
on app.zendesk_backfills
for select
using (app.can_read_client(client_id));

grant select on app.zendesk_agents to authenticated;
grant select on app.zendesk_sync_runs to authenticated;
grant select on app.zendesk_backfills to authenticated;
grant all on app.zendesk_agents to service_role;
grant all on app.zendesk_sync_runs to service_role;
grant all on app.zendesk_backfills to service_role;
