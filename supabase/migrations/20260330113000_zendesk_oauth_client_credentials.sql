alter table app.zendesk_connections
  add column if not exists oauth_client_id text,
  add column if not exists oauth_client_secret_encrypted text;
