import "server-only";

import { deriveSyncTrust } from "@/lib/sync-status";
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
  inclusion_status: "mapped" | "ignored" | "unmapped";
  match_source: "auto" | "manual" | "unmatched";
  manual_override: boolean;
};

type AssignmentAgentRow = {
  zendeskConnectionId: string;
  zendeskAgentId: string;
  zendeskName: string | null;
  email: string | null;
  mapping: MappingRow | null;
  suggestedUser: ConnecteamUserRow | null;
  reviewBucket: "needs_action" | "ignored" | "mapped";
  reviewReason: string;
  hasProblem: boolean;
};

type MappingReviewStats = {
  total: number;
  mapped: number;
  ignored: number;
  unmapped: number;
  needsAction: number;
  problems: number;
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

type ShiftTypeRow = {
  job_id: string;
  title: string | null;
  code: string | null;
  include_in_worked_hours: boolean;
  is_deleted: boolean;
  last_seen_at: string;
};

function normalizeEmail(value: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function emptyMappingReviewStats(): MappingReviewStats {
  return {
    total: 0,
    mapped: 0,
    ignored: 0,
    unmapped: 0,
    needsAction: 0,
    problems: 0
  };
}

function summarizeAssignmentAgents(agents: AssignmentAgentRow[]) {
  const summary = emptyMappingReviewStats();

  for (const agent of agents) {
    summary.total += 1;

    if (agent.mapping?.inclusion_status === "mapped") {
      summary.mapped += 1;
    }

    if (agent.mapping?.inclusion_status === "ignored") {
      summary.ignored += 1;
    }

    if (!agent.mapping || agent.mapping.inclusion_status === "unmapped") {
      summary.unmapped += 1;
    }

    if (agent.reviewBucket === "needs_action") {
      summary.needsAction += 1;
    }

    if (agent.hasProblem) {
      summary.problems += 1;
    }
  }

  return summary;
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
    { data: zendeskConnections, error: zendeskConnectionsError },
    { data: shiftTypes, error: shiftTypesError }
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
      .limit(200),
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
    supabase.from("zendesk_connections").select("id,client_id,name,subdomain").order("name"),
    supabase
      .from("connecteam_shift_types")
      .select("job_id,title,code,include_in_worked_hours,is_deleted,last_seen_at")
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
  if (shiftTypesError) throw shiftTypesError;

  const latestRunByConnection = new Map<string, SyncRunRow>();
  const latestSuccessRunByConnection = new Map<string, SyncRunRow>();
  const latestFailedRunByConnection = new Map<string, SyncRunRow>();
  for (const run of (runs ?? []) as SyncRunRow[]) {
    if (!latestRunByConnection.has(run.connecteam_connection_id)) {
      latestRunByConnection.set(run.connecteam_connection_id, run);
    }

    if (
      (run.status === "succeeded" || run.status === "partial") &&
      !latestSuccessRunByConnection.has(run.connecteam_connection_id)
    ) {
      latestSuccessRunByConnection.set(run.connecteam_connection_id, run);
    }

    if (run.status === "failed" && !latestFailedRunByConnection.has(run.connecteam_connection_id)) {
      latestFailedRunByConnection.set(run.connecteam_connection_id, run);
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

  return ((connections ?? []) as ConnectionStatusRow[]).map((connection) => {
    const latestRun = latestRunByConnection.get(connection.id) ?? null;
    const latestSuccessfulRun = latestSuccessRunByConnection.get(connection.id) ?? null;
    const latestFailedRun = latestFailedRunByConnection.get(connection.id) ?? null;

    return {
      ...connection,
      client: connection.client_id ? clientById.get(connection.client_id) ?? null : null,
      latestRun,
      latestSuccessfulRun,
      latestFailedRun,
      syncTrust: deriveSyncTrust({
        system: "connecteam",
        syncStatus: connection.sync_status,
        lastSyncStartedAt: connection.last_sync_started_at,
        latestRun,
        latestSuccessAt: latestSuccessfulRun?.completed_at ?? connection.last_synced_at,
        latestFailureAt:
          latestFailedRun?.completed_at ??
          (connection.last_sync_status === "failed" ? connection.last_sync_completed_at : null),
        latestFailureMessage: latestFailedRun?.error_message ?? connection.last_sync_error,
        freshnessAt: connection.users_synced_at ?? connection.last_synced_at,
        freshnessSourceLabel: "users synced"
      }),
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
      }),
      shiftTypes: [...((shiftTypes ?? []) as ShiftTypeRow[])].sort((left, right) =>
        (left.title ?? left.code ?? left.job_id).localeCompare(right.title ?? right.code ?? right.job_id)
      )
    };
  });
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
        "id,client_id,zendesk_connection_id,connecteam_connection_id,zendesk_agent_id,connecteam_user_id,display_name,email,zendesk_agent_name,connecteam_user_name,inclusion_status,match_source,manual_override"
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
    const userById = new Map(connectionUsers.map((user) => [user.connecteam_user_id, user]));
    const usersByEmail = new Map<string, ConnecteamUserRow[]>();

    for (const user of connectionUsers) {
      const email = normalizeEmail(user.email);
      if (!email) {
        continue;
      }

      const list = usersByEmail.get(email) ?? [];
      list.push(user);
      usersByEmail.set(email, list);
    }

    const assignmentRows = connection.schedulerAssignments.map((assignment) => {
      const agentRows = zendeskAgents
        .filter(
          (agent) =>
            agent.client_id === assignment.client_id && agent.zendesk_connection_id === assignment.zendesk_connection_id
        )
        .map((agent) => {
          const email = normalizeEmail(agent.email);
          const mapping =
            mappingByZendeskKey.get(
              `${connection.id}:${agent.zendesk_connection_id}:${agent.zendesk_user_id}`
            ) ?? null;
          const mappedUser =
            mapping?.connecteam_user_id ? userById.get(mapping.connecteam_user_id) ?? null : null;
          const emailMatches = email ? usersByEmail.get(email) ?? [] : [];
          const suggestedUser = !mappedUser && emailMatches.length === 1 ? emailMatches[0] : null;

          let reviewBucket: AssignmentAgentRow["reviewBucket"] = "needs_action";
          let reviewReason = "No Connecteam match yet.";
          let hasProblem = false;

          if (mapping?.inclusion_status === "ignored") {
            reviewBucket = "ignored";
            reviewReason = "Ignored intentionally and excluded from staffing metrics.";
          } else if (mapping?.inclusion_status === "mapped" && mappedUser) {
            reviewBucket = "mapped";
            reviewReason =
              mapping.match_source === "auto"
                ? "Mapped automatically and included in staffing metrics."
                : "Mapped manually and included in staffing metrics.";
          } else if (mapping?.inclusion_status === "mapped" && !mappedUser) {
            reviewReason = "Mapped user is no longer present in the current Connecteam sync.";
            hasProblem = true;
          } else if (!email) {
            reviewReason = "Zendesk agent has no email, so auto-match cannot assist triage.";
            hasProblem = true;
          } else if (emailMatches.length > 1) {
            reviewReason = "Multiple Connecteam users share this email. Review manually.";
            hasProblem = true;
          } else if (suggestedUser) {
            reviewReason = "Exact email match available. Review and save in bulk.";
          }

          return {
            zendeskConnectionId: agent.zendesk_connection_id,
            zendeskAgentId: agent.zendesk_user_id,
            zendeskName: agent.name,
            email,
            mapping,
            suggestedUser,
            reviewBucket,
            reviewReason,
            hasProblem
          };
        })
        .sort((left, right) =>
          (left.zendeskName ?? left.email ?? "").localeCompare(right.zendeskName ?? right.email ?? "")
        );
      const reviewSummary = summarizeAssignmentAgents(agentRows);

      return {
        ...assignment,
        users: connectionUsers.sort((left, right) =>
          (left.full_name ?? left.email ?? left.connecteam_user_id).localeCompare(
            right.full_name ?? right.email ?? right.connecteam_user_id
          )
        ),
        zendeskAgents: agentRows,
        reviewSummary,
        reviewGroups: {
          needsAction: agentRows.filter((agent) => agent.reviewBucket === "needs_action"),
          ignored: agentRows.filter((agent) => agent.reviewBucket === "ignored"),
          mapped: agentRows.filter((agent) => agent.reviewBucket === "mapped")
        }
      };
    });
    const mappingReviewSummary = assignmentRows.reduce((summary, assignment) => {
      summary.total += assignment.reviewSummary.total;
      summary.mapped += assignment.reviewSummary.mapped;
      summary.ignored += assignment.reviewSummary.ignored;
      summary.unmapped += assignment.reviewSummary.unmapped;
      summary.needsAction += assignment.reviewSummary.needsAction;
      summary.problems += assignment.reviewSummary.problems;
      return summary;
    }, emptyMappingReviewStats());

    return {
      ...connection,
      users: connectionUsers,
      mappings: mappingRows,
      assignmentRows,
      mappingReviewSummary,
      mappingSummary: {
        mapped: mappingRows.filter((row) => row.inclusion_status === "mapped").length,
        ignored: mappingRows.filter((row) => row.inclusion_status === "ignored").length,
        unmapped: mappingRows.filter((row) => row.inclusion_status === "unmapped").length
      }
    };
  });
}
