create extension if not exists pgcrypto;

create schema if not exists app;

create table if not exists app.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('admin', 'manager', 'viewer')),
  description text not null,
  created_at timestamptz not null default timezone('utc', now())
);

insert into app.roles (name, description)
values
  ('admin', 'Full platform access.'),
  ('manager', 'Read access to operational data across all clients.'),
  ('viewer', 'Read access restricted to explicitly assigned clients.')
on conflict (name) do update
set description = excluded.description;

create table if not exists app.users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (user_id) on delete cascade,
  role_id uuid not null references app.roles (id) on delete cascade,
  is_primary boolean not null default false,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, role_id)
);

create unique index if not exists user_role_assignments_primary_idx
  on app.user_role_assignments (user_id)
  where is_primary = true;

create table if not exists app.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.viewer_client_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (user_id) on delete cascade,
  client_id uuid not null references app.clients (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, client_id)
);

create table if not exists app.zendesk_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  name text not null,
  subdomain text not null,
  external_account_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  status text not null default 'disconnected' check (status in ('active', 'disconnected', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (client_id, subdomain)
);

create table if not exists app.connecteam_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  name text not null,
  external_account_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  status text not null default 'disconnected' check (status in ('active', 'disconnected', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.agent_mappings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  zendesk_connection_id uuid references app.zendesk_connections (id) on delete cascade,
  connecteam_connection_id uuid references app.connecteam_connections (id) on delete cascade,
  zendesk_agent_id text,
  connecteam_user_id text,
  display_name text not null,
  email text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists agent_mappings_unique_ids_idx
  on app.agent_mappings (client_id, coalesce(zendesk_agent_id, ''), coalesce(connecteam_user_id, ''));

create table if not exists app.tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  zendesk_connection_id uuid not null references app.zendesk_connections (id) on delete cascade,
  agent_mapping_id uuid references app.agent_mappings (id) on delete set null,
  zendesk_ticket_id text not null,
  subject text,
  status text,
  priority text,
  requester_email text,
  created_at_source timestamptz,
  updated_at_source timestamptz,
  ingested_at timestamptz not null default timezone('utc', now()),
  unique (zendesk_connection_id, zendesk_ticket_id)
);

create table if not exists app.ticket_metrics (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references app.tickets (id) on delete cascade,
  first_response_minutes numeric(10, 2),
  full_resolution_minutes numeric(10, 2),
  handle_time_minutes numeric(10, 2),
  satisfaction_score numeric(10, 2),
  payload jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.timesheet_data (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  connecteam_connection_id uuid not null references app.connecteam_connections (id) on delete cascade,
  agent_mapping_id uuid references app.agent_mappings (id) on delete set null,
  connecteam_timesheet_id text not null,
  work_date date not null,
  minutes_worked integer not null default 0,
  billable_minutes integer,
  payload jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default timezone('utc', now()),
  unique (connecteam_connection_id, connecteam_timesheet_id)
);

create table if not exists app.computed_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app.clients (id) on delete cascade,
  metric_date date not null,
  metric_key text not null,
  dimension jsonb not null default '{}'::jsonb,
  metric_value numeric(14, 4) not null,
  computed_at timestamptz not null default timezone('utc', now()),
  unique (client_id, metric_date, metric_key, dimension)
);

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  viewer_role_id uuid;
begin
  insert into app.users (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (user_id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      updated_at = timezone('utc', now());

  select id into viewer_role_id from app.roles where name = 'viewer';

  if viewer_role_id is not null then
    insert into app.user_role_assignments (user_id, role_id, is_primary)
    values (new.id, viewer_role_id, true)
    on conflict (user_id, role_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function app.current_user_role()
returns text
language sql
stable
set search_path = app, public
as $$
  select coalesce(
    (
      select r.name
      from app.user_role_assignments ura
      join app.roles r on r.id = ura.role_id
      where ura.user_id = auth.uid()
      order by
        case r.name
          when 'admin' then 3
          when 'manager' then 2
          else 1
        end desc,
        ura.is_primary desc
      limit 1
    ),
    'viewer'
  );
$$;

create or replace function app.user_is_admin(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1
    from app.user_role_assignments ura
    join app.roles r on r.id = ura.role_id
    where ura.user_id = user_uuid
      and r.name = 'admin'
  );
$$;

create or replace function app.user_is_manager(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1
    from app.user_role_assignments ura
    join app.roles r on r.id = ura.role_id
    where ura.user_id = user_uuid
      and r.name = 'manager'
  );
$$;

create or replace function app.viewer_can_access_client(target_client_id uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1
    from app.viewer_client_assignments vca
    where vca.user_id = user_uuid
      and vca.client_id = target_client_id
  );
$$;

create or replace function app.can_read_client(target_client_id uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
stable
set search_path = app, public
as $$
  select
    app.user_is_admin(user_uuid)
    or app.user_is_manager(user_uuid)
    or app.viewer_can_access_client(target_client_id, user_uuid);
$$;

create or replace function app.bootstrap_first_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  admin_role_id uuid;
begin
  if exists (
    select 1
    from app.user_role_assignments ura
    join app.roles r on r.id = ura.role_id
    where r.name = 'admin'
  ) then
    raise exception 'An admin role assignment already exists.';
  end if;

  if not exists (select 1 from app.users where user_id = target_user_id) then
    insert into app.users (user_id, email, full_name)
    select
      id,
      email,
      coalesce(raw_user_meta_data ->> 'full_name', email)
    from auth.users
    where id = target_user_id;
  end if;

  update app.user_role_assignments
  set is_primary = false
  where user_id = target_user_id;

  select id into admin_role_id from app.roles where name = 'admin';

  insert into app.user_role_assignments (user_id, role_id, is_primary)
  values (target_user_id, admin_role_id, true)
  on conflict (user_id, role_id) do update
  set is_primary = true;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure app.handle_new_user();

drop trigger if exists users_set_updated_at on app.users;
create trigger users_set_updated_at
  before update on app.users
  for each row execute procedure app.set_updated_at();

drop trigger if exists clients_set_updated_at on app.clients;
create trigger clients_set_updated_at
  before update on app.clients
  for each row execute procedure app.set_updated_at();

drop trigger if exists zendesk_connections_set_updated_at on app.zendesk_connections;
create trigger zendesk_connections_set_updated_at
  before update on app.zendesk_connections
  for each row execute procedure app.set_updated_at();

drop trigger if exists connecteam_connections_set_updated_at on app.connecteam_connections;
create trigger connecteam_connections_set_updated_at
  before update on app.connecteam_connections
  for each row execute procedure app.set_updated_at();

drop trigger if exists agent_mappings_set_updated_at on app.agent_mappings;
create trigger agent_mappings_set_updated_at
  before update on app.agent_mappings
  for each row execute procedure app.set_updated_at();

alter table app.roles enable row level security;
alter table app.users enable row level security;
alter table app.user_role_assignments enable row level security;
alter table app.clients enable row level security;
alter table app.viewer_client_assignments enable row level security;
alter table app.zendesk_connections enable row level security;
alter table app.connecteam_connections enable row level security;
alter table app.agent_mappings enable row level security;
alter table app.tickets enable row level security;
alter table app.ticket_metrics enable row level security;
alter table app.timesheet_data enable row level security;
alter table app.computed_metrics enable row level security;

create policy "admins manage roles"
on app.roles
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "authenticated users can read roles"
on app.roles
for select
using (auth.role() = 'authenticated');

create policy "admins manage users"
on app.users
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "users can read own profile"
on app.users
for select
using (auth.uid() = user_id or app.user_is_admin() or app.user_is_manager());

create policy "admins manage role assignments"
on app.user_role_assignments
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "users can read own role assignments"
on app.user_role_assignments
for select
using (auth.uid() = user_id or app.user_is_admin() or app.user_is_manager());

create policy "admins manage clients"
on app.clients
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read clients by role"
on app.clients
for select
using (app.can_read_client(id));

create policy "admins manage viewer assignments"
on app.viewer_client_assignments
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "users can read relevant viewer assignments"
on app.viewer_client_assignments
for select
using (auth.uid() = user_id or app.user_is_admin() or app.user_is_manager());

create policy "admins manage zendesk connections"
on app.zendesk_connections
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read zendesk connections by client access"
on app.zendesk_connections
for select
using (app.can_read_client(client_id));

create policy "admins manage connecteam connections"
on app.connecteam_connections
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read connecteam connections by client access"
on app.connecteam_connections
for select
using (app.can_read_client(client_id));

create policy "admins manage agent mappings"
on app.agent_mappings
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read agent mappings by client access"
on app.agent_mappings
for select
using (app.can_read_client(client_id));

create policy "admins manage tickets"
on app.tickets
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read tickets by client access"
on app.tickets
for select
using (app.can_read_client(client_id));

create policy "admins manage ticket metrics"
on app.ticket_metrics
for all
using (
  app.user_is_admin()
)
with check (
  app.user_is_admin()
);

create policy "read ticket metrics by related ticket access"
on app.ticket_metrics
for select
using (
  exists (
    select 1
    from app.tickets t
    where t.id = ticket_id
      and app.can_read_client(t.client_id)
  )
);

create policy "admins manage timesheet data"
on app.timesheet_data
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read timesheet data by client access"
on app.timesheet_data
for select
using (app.can_read_client(client_id));

create policy "admins manage computed metrics"
on app.computed_metrics
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read computed metrics by client access"
on app.computed_metrics
for select
using (app.can_read_client(client_id));

grant usage on schema app to authenticated;
grant select on app.roles to authenticated;
grant select, update on app.users to authenticated;
grant select on app.user_role_assignments to authenticated;
grant select on app.clients to authenticated;
grant select on app.viewer_client_assignments to authenticated;
grant select on app.zendesk_connections to authenticated;
grant select on app.connecteam_connections to authenticated;
grant select on app.agent_mappings to authenticated;
grant select on app.tickets to authenticated;
grant select on app.ticket_metrics to authenticated;
grant select on app.timesheet_data to authenticated;
grant select on app.computed_metrics to authenticated;
grant all on all tables in schema app to service_role;
grant execute on function app.current_user_role() to authenticated;
grant execute on function app.user_is_admin(uuid) to authenticated;
grant execute on function app.user_is_manager(uuid) to authenticated;
grant execute on function app.viewer_can_access_client(uuid, uuid) to authenticated;
grant execute on function app.can_read_client(uuid, uuid) to authenticated;

