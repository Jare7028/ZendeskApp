drop index if exists app.agent_mappings_unique_zendesk_agent_idx;

create unique index if not exists agent_mappings_unique_zendesk_agent_idx
  on app.agent_mappings (client_id, zendesk_connection_id, zendesk_agent_id);

drop index if exists app.agent_mappings_unique_connecteam_user_idx;

create unique index if not exists agent_mappings_unique_connecteam_user_idx
  on app.agent_mappings (client_id, connecteam_connection_id, connecteam_user_id);
