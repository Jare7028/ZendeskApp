alter table app.agent_mappings
  add column if not exists inclusion_status text not null default 'unmapped'
    check (inclusion_status in ('mapped', 'ignored', 'unmapped'));

update app.agent_mappings
set inclusion_status = case
  when connecteam_user_id is not null then 'mapped'
  when manual_override then 'ignored'
  else 'unmapped'
end;

alter table app.agent_mappings
  add constraint agent_mappings_mapped_requires_connecteam_user
  check (inclusion_status <> 'mapped' or connecteam_user_id is not null);
