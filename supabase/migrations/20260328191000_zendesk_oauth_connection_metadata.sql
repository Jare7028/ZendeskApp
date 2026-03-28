alter table app.zendesk_connections
  add column if not exists oauth_state text,
  add column if not exists oauth_state_expires_at timestamptz,
  add column if not exists token_type text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists refresh_token_expires_at timestamptz,
  add column if not exists last_validated_at timestamptz,
  add column if not exists last_validation_status text
    check (last_validation_status in ('succeeded', 'failed')),
  add column if not exists last_validation_error text;

create unique index if not exists zendesk_connections_oauth_state_idx
  on app.zendesk_connections (oauth_state)
  where oauth_state is not null;
