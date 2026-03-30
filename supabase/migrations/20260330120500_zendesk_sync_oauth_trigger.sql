alter table app.zendesk_sync_runs
  drop constraint if exists zendesk_sync_runs_trigger_source_check;

alter table app.zendesk_sync_runs
  add constraint zendesk_sync_runs_trigger_source_check
    check (trigger_source in ('cron', 'manual', 'oauth'));
