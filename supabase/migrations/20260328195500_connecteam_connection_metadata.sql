alter table app.connecteam_connections
  add column if not exists credential_type text not null default 'api_key'
    check (credential_type in ('api_key')),
  add column if not exists last_validated_at timestamptz,
  add column if not exists last_validation_status text
    check (last_validation_status in ('succeeded', 'failed')),
  add column if not exists last_validation_error text;
