create table if not exists app.sla_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  client_id uuid not null references app.clients (id) on delete cascade,
  zendesk_connection_id uuid not null references app.zendesk_connections (id) on delete cascade,
  metric_type text not null check (metric_type in ('first_reply', 'full_resolution')),
  status text not null default 'active' check (status in ('active', 'resolved')),
  title text not null,
  message text not null,
  threshold_percentage numeric(5,2) not null,
  compliance_percentage numeric(5,2),
  breach_count integer not null default 0,
  compliant_count integer not null default 0,
  window_start date not null,
  window_end date not null,
  last_evaluated_at timestamptz not null default timezone('utc', now()),
  last_notified_at timestamptz,
  notification_count integer not null default 0,
  email_status text,
  email_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists sla_alert_events_client_status_idx
  on app.sla_alert_events (client_id, status, last_evaluated_at desc);

create index if not exists sla_alert_events_connection_metric_idx
  on app.sla_alert_events (zendesk_connection_id, metric_type);

drop trigger if exists sla_alert_events_set_updated_at on app.sla_alert_events;
create trigger sla_alert_events_set_updated_at
  before update on app.sla_alert_events
  for each row execute procedure app.set_updated_at();

alter table app.sla_alert_events enable row level security;

create policy "admins manage sla alert events"
on app.sla_alert_events
for all
using (app.user_is_admin())
with check (app.user_is_admin());

create policy "read sla alert events by client access"
on app.sla_alert_events
for select
using (app.can_read_client(client_id));

grant select on app.sla_alert_events to authenticated;
