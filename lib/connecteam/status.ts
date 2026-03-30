import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type ConnectionStatusRow = {
  id: string;
  client_id: string | null;
  connection_scope: "client" | "shared";
  name: string;
  credential_type: string;
  external_account_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  last_validated_at: string | null;
  last_validation_status: string | null;
  last_validation_error: string | null;
  last_synced_at: string | null;
  sync_status: string;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  users_synced_at: string | null;
  shifts_synced_through: string | null;
  created_at: string;
};

type SyncRunRow = {
  connecteam_connection_id: string;
  trigger_source: string;
  sync_mode: string;
  status: string;
  counts: Record<string, number> | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type MappingRow = {
  id: string;
  client_id: string;
  zendesk_connection_id: string | null;
  connecteam_connection_id: string | null;
  zendesk_agent_id: string | null;
  connecteam_user_id: string | null;
  display_name: string;
  email: string | null;
  zendesk_agent_name: string | null;
  connecteam_user_name: string | null;
  match_source: "auto" | "manual" | "unmatched";
  manual_override: boolean;
};

type ZendeskAgentRow = {
  client_id: string;
  zendesk_connection_id: string;
  zendesk_user_id: string;
  name: string | null;
  email: string | null;
};

type ConnecteamUserRow = {
  client_id: string | null;
  connecteam_connection_id: string;
  connecteam_user_id: string;
  email: string | null;
  full_name: string | null;
  status: string | null;
};

type SchedulerRow = {
  connecteam_connection_id: string;
  scheduler_id: string;
  scheduler_name: string | null;
};

type SchedulerAssignmentRow = {
  id: string;
  client_id: string;
  zendesk_connection_id: string;
  connecteam_connection_id: string;
  scheduler_id: string;
  scheduler_name: string | null;
};

type ZendeskConnectionRow = {
  id: string;
  client_id: string;
  name: string;
  subdomain: string;
};

function normalizeEmail(value: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export async function getConnecteamConnectionStatus() {
  const supabase = createServerSupabaseClient().schema("app");
  const [
    { data: clients, error: clientsError },
    { data: connections, error: connectionsError },
    { data: runs, error: runsError },
    { data: users, error: usersError },
    { data: shifts, error: shiftsError },
    { data: schedules, error: schedulesError },
    { data: schedulers, error: schedulersError },
    { data: schedulerAssignments, error: schedulerAssignmentsError },
    { data: zendeskConnections, error: zendeskConnectionsError }
  ] = await Promise.all([
    supabase.from("clients").select("id,name,slug").order("name"),
    supabase
      .from("connecteam_connections")
      .select(
        "id,client_id,connection_scope,name,credential_type,external_account_id,status,metadata,last_validated_at,last_validation_status,last_validation_error,last_synced_at,sync_status,last_sync_started_at,last_sync_completed_at,last_sync_status,last_sync_error,users_synced_at,shifts_synced_through,created_at"
      )
      .order("created_at"),
    supabase
      .from("connecteam_sync_runs")
      .select(
        "connecteam_connection_id,trigger_source,sync_mode,status,counts,started_at,completed_at,error_message"
      )
      .order("started_at", { ascending: false })
      .limit(50),
    supabase.from("connecteam_users").select("connecteam_connection_id"),
    supabase.from("connecteam_shifts").select("connecteam_connection_id"),
    supabase.from("connecteam_daily_schedules").select("connecteam_connection_id"),
    supabase
      .from("connecteam_schedulers")
      .select("connecteam_connection_id,scheduler_id,scheduler_name")
      .order("scheduler_name"),
    supabase
      .from("zendesk_connecteam_schedules")
      .select("id,client_id,zendesk_connection_id,connecteam_connection_id,scheduler_id,scheduler_name"),
    supabase.from("zendesk_connections").select("id,client_id,name,subdomain").order("name")
  ]);

  if (clientsError) throw clientsError;
  if (connectionsError) throw connectionsError;
  if (runsError) throw runsError;
  if (usersError) throw usersError;
  if (shiftsError) throw shiftsError;
  if (schedulesError) throw schedulesError;
  if (schedulersError) throw schedulersError;
  if (schedulerAssignmentsError) throw schedulerAssignmentsError;
  if (zendeskConnectionsError) throw zendeskConnectionsError;

  const latestRunByConnection = new Map<string, SyncRunRow>();
  for (const run of (runs ?? []) as SyncRunRow[]) {
    if (!latestRunByConnection.has(run.connecteam_connection_id)) {
      latestRunByConnection.set(run.connecteam_connection_id, run);
    }
  }

  const clientById = new Map(
    ((clients ?? []) as Array<{ id: string; name: string; slug: string }>).map((client) => [client.id, client])
  );
  const zendeskConnectionById = new Map(
    ((zendeskConnections ?? []) as ZendeskConnectionRow[]).map((connection) => [connection.id, connection])
  );

  const userCountByConnection = new Map<string, number>();
  for (const row of (users ?? []) as Array<{ connecteam_connection_id: string }>) {
    userCountByConnection.set(
      row.connecteam_connection_id,
      (userCountByConnection.get(row.connecteam_connection_id) ?? 0) + 1
    );
  }

  const shiftCountByConnection = new Map<string, number>();
  for (const row of (shifts ?? []) as Array<{ connecteam_connection_id: string }>) {
    shiftCountByConnection.set(
      row.connecteam_connection_id,
      (shiftCountByConnection.get(row.connecteam_connection_id) ?? 0) + 1
    );
  }

  const scheduleCountByConnection = new Map<string, number>();
  for (const row of (schedules ?? []) as Array<{ connecteam_connection_id: string }>) {
    scheduleCountByConnection.set(
      row.connecteam_connection_id,
      (scheduleCountByConnection.get(row.connecteam_connection_id) ?? 0) + 1
    );
  }

  const schedulersByConnection = new Map<string, SchedulerRow[]>();
  for (const scheduler of (schedulers ?? []) as SchedulerRow[]) {
    const list = schedulersByConnection.get(scheduler.connecteam_connection_id) ?? [];
    list.push(scheduler);
    schedulersByConnection.set(scheduler.connecteam_connection_id, list);
  }

  const assignmentsByConnection = new Map<string, SchedulerAssignmentRow[]>();
  for (const assignment of (schedulerAssignments ?? []) as SchedulerAssignmentRow[]) {
    const list = assignmentsByConnection.get(assignment.connecteam_connection_id) ?? [];
    list.push(assignment);
    assignmentsByConnection.set(assignment.connecteam_connection_id, list);
  }

  return ((connections ?? []) as ConnectionStatusRow[]).map((connection) => ({
    ...connection,
    client: connection.client_id ? clientById.get(connection.client_id) ?? null : null,
    latestRun: latestRunByConnection.get(connection.id) ?? null,
    persistedCounts: {
      users: userCountByConnection.get(connection.id) ?? 0,
      shifts: shiftCountByConnection.get(connection.id) ?? 0,
      scheduledDays: scheduleCountByConnection.get(connection.id) ?? 0
    },
    schedulers: (schedulersByConnection.get(connection.id) ?? []).sort((left, right) =>
      (left.scheduler_name ?? left.scheduler_id).localeCompare(right.scheduler_name ?? right.scheduler_id)
    ),
    schedulerAssignments: (assignmentsByConnection.get(connection.id) ?? []).map((assignment) => {
      const zendeskConnection = zendeskConnectionById.get(assignment.zendesk_connection_id) ?? null;
      return {
        ...assignment,
        client: clientById.get(assignment.client_id) ?? null,
        zendeskConnection
      };
    })
  }));
}

export async function getConnecteamAdminOverview() {
  const supabase = createServerSupabaseClient().schema("app");
  const [connections, zendeskAgentsResult, connecteamUsersResult, mappingsResult] = await Promise.all([
    getConnecteamConnectionStatus(),
    supabase.from("zendesk_agents").select("client_id,zendesk_connection_id,zendesk_user_id,name,email"),
    supabase.from("connecteam_users").select("client_id,connecteam_connection_id,connecteam_user_id,email,full_name,status"),
    supabase
      .from("agent_mappings")
      .select(
        "id,client_id,zendesk_connection_id,connecteam_connection_id,zendesk_agent_id,connecteam_user_id,display_name,email,zendesk_agent_name,connecteam_user_name,match_source,manual_override"
      )
      .not("connecteam_connection_id", "is", null)
  ]);

  if (zendeskAgentsResult.error) throw zendeskAgentsResult.error;
  if (connecteamUsersResult.error) throw connecteamUsersResult.error;
  if (mappingsResult.error) throw mappingsResult.error;

  const zendeskAgents = (zendeskAgentsResult.data ?? []) as ZendeskAgentRow[];
  const connecteamUsers = (connecteamUsersResult.data ?? []) as ConnecteamUserRow[];
  const mappings = (mappingsResult.data ?? []) as MappingRow[];

  const usersByConnection = new Map<string, ConnecteamUserRow[]>();
  for (const user of connecteamUsers) {
    const list = usersByConnection.get(user.connecteam_connection_id) ?? [];
    list.push(user);
    usersByConnection.set(user.connecteam_connection_id, list);
  }

  const mappingsByConnection = new Map<string, MappingRow[]>();
  const mappingByZendeskKey = new Map<string, MappingRow>();
  for (const mapping of mappings) {
    if (!mapping.connecteam_connection_id) {
      continue;
    }

    const list = mappingsByConnection.get(mapping.connecteam_connection_id) ?? [];
    list.push(mapping);
    mappingsByConnection.set(mapping.connecteam_connection_id, list);

    if (mapping.zendesk_connection_id && mapping.zendesk_agent_id) {
      mappingByZendeskKey.set(
        `${mapping.connecteam_connection_id}:${mapping.zendesk_connection_id}:${mapping.zendesk_agent_id}`,
        mapping
      );
    }
  }

  return connections.map((connection) => {
    const connectionUsers = usersByConnection.get(connection.id) ?? [];
    const mappingRows = mappingsByConnection.get(connection.id) ?? [];
    const assignmentRows = connection.schedulerAssignments.map((assignment) => {
      const agentRows = zendeskAgents
        .filter(
          (agent) =>
            agent.client_id === assignment.client_id && agent.zendesk_connection_id === assignment.zendesk_connection_id
        )
        .map((agent) => ({
          zendeskConnectionId: agent.zendesk_connection_id,
          zendeskAgentId: agent.zendesk_user_id,
          zendeskName: agent.name,
          email: normalizeEmail(agent.email),
          mapping:
            mappingByZendeskKey.get(
              `${connection.id}:${agent.zendesk_connection_id}:${agent.zendesk_user_id}`
            ) ?? null
        }))
        .sort((left, right) =>
          (left.zendeskName ?? left.email ?? "").localeCompare(right.zendeskName ?? right.email ?? "")
        );

      return {
        ...assignment,
        users: connectionUsers.sort((left, right) =>
          (left.full_name ?? left.email ?? left.connecteam_user_id).localeCompare(
            right.full_name ?? right.email ?? right.connecteam_user_id
          )
        ),
        zendeskAgents: agentRows
      };
    });

    return {
      ...connection,
      users: connectionUsers,
      mappings: mappingRows,
      assignmentRows,
      mappingSummary: {
        auto: mappingRows.filter((row) => row.match_source === "auto").length,
        manual: mappingRows.filter((row) => row.match_source === "manual").length,
        unmatched: mappingRows.filter((row) => row.match_source === "unmatched").length
      }
    };
  });
}
