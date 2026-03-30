alter table app.connecteam_connections
  alter column client_id drop not null;

alter table app.connecteam_connections
  add column if not exists connection_scope text not null default 'client'
    check (connection_scope in ('client', 'shared'));

update app.connecteam_connections
set connection_scope = case when client_id is null then 'shared' else 'client' end
where connection_scope is distinct from case when client_id is null then 'shared' else 'client' end;

alter table app.connecteam_users
  alter column client_id drop not null;

alter table app.connecteam_sync_runs
  alter column client_id drop not null;

create table if not exists app.connecteam_schedulers (
  id uuid primary key default gen_random_uuid(),
  connecteam_connection_id uuid not null references app.connecteam_connections (id) on delete cascade,
  scheduler_id text not null,
  scheduler_name text,
  raw_payload jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default timezone('utc', now()),
  unique (connecteam_connection_id, scheduler_id)
);

create table if not exists app.zendesk_connecteam_schedules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  zendesk_connection_id uuid not null unique references app.zendesk_connections (id) on delete cascade,
  connecteam_connection_id uuid not null references app.connecteam_connections (id) on delete cascade,
  scheduler_id text not null,
  scheduler_name text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists zendesk_connecteam_schedules_set_updated_at on app.zendesk_connecteam_schedules;
create trigger zendesk_connecteam_schedules_set_updated_at
  before update on app.zendesk_connecteam_schedules
  for each row execute procedure app.set_updated_at();

alter table app.connecteam_shifts
  add column if not exists zendesk_connection_id uuid references app.zendesk_connections (id) on delete cascade;

alter table app.connecteam_daily_schedules
  add column if not exists zendesk_connection_id uuid references app.zendesk_connections (id) on delete cascade;

alter table app.timesheet_data
  add column if not exists zendesk_connection_id uuid references app.zendesk_connections (id) on delete cascade;

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'app.connecteam_shifts'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%connecteam_connection_id, connecteam_shift_id, connecteam_user_id%';

  if constraint_name is not null then
    execute format('alter table app.connecteam_shifts drop constraint %I', constraint_name);
  end if;
end
$$;

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'app.connecteam_daily_schedules'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%connecteam_connection_id, connecteam_user_id, work_date%';

  if constraint_name is not null then
    execute format('alter table app.connecteam_daily_schedules drop constraint %I', constraint_name);
  end if;
end
$$;

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'app.timesheet_data'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%connecteam_connection_id, connecteam_timesheet_id%';

  if constraint_name is not null then
    execute format('alter table app.timesheet_data drop constraint %I', constraint_name);
  end if;
end
$$;

drop index if exists app.connecteam_shifts_connection_user_date_idx;

create unique index if not exists connecteam_shifts_client_connection_shift_user_idx
  on app.connecteam_shifts (
    client_id,
    coalesce(zendesk_connection_id, '00000000-0000-0000-0000-000000000000'::uuid),
    connecteam_connection_id,
    connecteam_shift_id,
    connecteam_user_id
  );

create index if not exists connecteam_shifts_client_connection_user_date_idx
  on app.connecteam_shifts (
    client_id,
    coalesce(zendesk_connection_id, '00000000-0000-0000-0000-000000000000'::uuid),
    connecteam_connection_id,
    connecteam_user_id,
    shift_date
  );

create unique index if not exists connecteam_daily_schedules_client_connection_user_date_idx
  on app.connecteam_daily_schedules (
    client_id,
    coalesce(zendesk_connection_id, '00000000-0000-0000-0000-000000000000'::uuid),
    connecteam_connection_id,
    connecteam_user_id,
    work_date
  );

create unique index if not exists timesheet_data_client_connection_timesheet_idx
  on app.timesheet_data (
    client_id,
    coalesce(zendesk_connection_id, '00000000-0000-0000-0000-000000000000'::uuid),
    connecteam_connection_id,
    connecteam_timesheet_id
  );

alter table app.connecteam_schedulers enable row level security;
alter table app.zendesk_connecteam_schedules enable row level security;

create policy "admins manage connecteam schedulers"
on app.connecteam_schedulers
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "admins read connecteam schedulers"
on app.connecteam_schedulers
for select
using (app.user_is_admin());

create policy "admins manage zendesk connecteam schedules"
on app.zendesk_connecteam_schedules
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read zendesk connecteam schedules by client access"
on app.zendesk_connecteam_schedules
for select
using (app.can_read_client(client_id));

grant select on app.connecteam_schedulers to authenticated;
grant select on app.zendesk_connecteam_schedules to authenticated;
grant all on app.connecteam_schedulers to service_role;
grant all on app.zendesk_connecteam_schedules to service_role;
