create table if not exists app.role_scout_jobs (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  role_title text not null,
  location_text text,
  employment_type text,
  compensation_text text,
  source_name text,
  source_url text,
  role_summary text,
  status text not null default 'active'
    check (status in ('active', 'watchlist', 'contacted', 'ignore')),
  ignore_reason text,
  ignored_at timestamptz,
  contacted_at timestamptz,
  status_updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint role_scout_jobs_ignore_reason_required
    check (
      (status = 'ignore' and nullif(btrim(ignore_reason), '') is not null)
      or (status <> 'ignore' and ignore_reason is null)
    )
);

create table if not exists app.role_scout_job_status_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references app.role_scout_jobs (id) on delete cascade,
  previous_status text,
  next_status text not null
    check (next_status in ('active', 'watchlist', 'contacted', 'ignore')),
  ignore_reason text,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists role_scout_jobs_status_updated_idx
  on app.role_scout_jobs (status, status_updated_at desc);

create index if not exists role_scout_jobs_company_updated_idx
  on app.role_scout_jobs (company_name, updated_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'role_scout_jobs_source_url_key'
      and conrelid = 'app.role_scout_jobs'::regclass
  ) then
    alter table app.role_scout_jobs
      add constraint role_scout_jobs_source_url_key unique (source_url);
  end if;
end $$;

create index if not exists role_scout_job_status_history_job_created_idx
  on app.role_scout_job_status_history (job_id, created_at desc);

drop trigger if exists role_scout_jobs_set_updated_at on app.role_scout_jobs;
create trigger role_scout_jobs_set_updated_at
  before update on app.role_scout_jobs
  for each row execute procedure app.set_updated_at();

alter table app.role_scout_jobs enable row level security;
alter table app.role_scout_job_status_history enable row level security;

drop policy if exists "authenticated users read role scout jobs" on app.role_scout_jobs;
create policy "authenticated users read role scout jobs"
on app.role_scout_jobs
for select
using (auth.role() = 'authenticated');

drop policy if exists "authenticated users read role scout job history" on app.role_scout_job_status_history;
create policy "authenticated users read role scout job history"
on app.role_scout_job_status_history
for select
using (auth.role() = 'authenticated');

grant select on app.role_scout_jobs to authenticated;
grant select on app.role_scout_job_status_history to authenticated;
grant all on app.role_scout_jobs to service_role;
grant all on app.role_scout_job_status_history to service_role;
