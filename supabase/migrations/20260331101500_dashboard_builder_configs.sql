create table if not exists app.dashboard_builder_configs (
  user_id uuid primary key references app.users (user_id) on delete cascade,
  version integer not null default 1 check (version > 0),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists dashboard_builder_configs_set_updated_at on app.dashboard_builder_configs;
create trigger dashboard_builder_configs_set_updated_at
  before update on app.dashboard_builder_configs
  for each row execute procedure app.set_updated_at();

alter table app.dashboard_builder_configs enable row level security;

create policy "users manage own dashboard builder config"
on app.dashboard_builder_configs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on app.dashboard_builder_configs to authenticated;
