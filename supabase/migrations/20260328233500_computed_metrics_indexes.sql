create index if not exists computed_metrics_client_date_key_idx
  on app.computed_metrics (client_id, metric_date, metric_key);

create index if not exists computed_metrics_dimension_gin_idx
  on app.computed_metrics
  using gin (dimension);

create index if not exists computed_metrics_scope_idx
  on app.computed_metrics ((dimension ->> 'scope'));

create index if not exists computed_metrics_agent_idx
  on app.computed_metrics ((dimension ->> 'agentMappingId'))
  where dimension ? 'agentMappingId';

create index if not exists computed_metrics_channel_idx
  on app.computed_metrics ((dimension ->> 'channel'))
  where dimension ? 'channel';
