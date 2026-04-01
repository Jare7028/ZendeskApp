create table if not exists app.connecteam_shift_types (
  id uuid primary key default gen_random_uuid(),
  job_id text not null unique,
  title text,
  code text,
  color text,
  include_in_worked_hours boolean not null default true,
  is_deleted boolean not null default false,
  source_payload jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists connecteam_shift_types_set_updated_at on app.connecteam_shift_types;
create trigger connecteam_shift_types_set_updated_at
  before update on app.connecteam_shift_types
  for each row execute procedure app.set_updated_at();

alter table app.connecteam_shifts
  add column if not exists job_id text,
  add column if not exists job_title text,
  add column if not exists job_code text;

create index if not exists connecteam_shifts_connection_job_date_idx
  on app.connecteam_shifts (connecteam_connection_id, job_id, shift_date);

alter table app.connecteam_shift_types enable row level security;

create policy "admins manage connecteam shift types"
on app.connecteam_shift_types
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "admins read connecteam shift types"
on app.connecteam_shift_types
for select
using (app.user_is_admin());

grant select on app.connecteam_shift_types to authenticated;
grant all on app.connecteam_shift_types to service_role;
