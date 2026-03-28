import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  ZendeskClient,
  type ZendeskConnectionCredentials,
  type ZendeskTicketMetricRecord,
  type ZendeskTicketRecord,
  type ZendeskUserRecord
} from "@/lib/zendesk/client";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

type ConnectionRow = {
  id: string;
  client_id: string;
  name: string;
  subdomain: string;
  access_token_encrypted: string | null;
  api_user_email: string | null;
  credential_type: "api_token" | "oauth_token";
  status: "active" | "disconnected" | "error";
  sync_status: "idle" | "running" | "error";
  sync_lock_expires_at: string | null;
  last_synced_at: string | null;
  tickets_synced_through: string | null;
  ticket_metrics_synced_through: string | null;
  agents_synced_through: string | null;
};

type BackfillRow = {
  id: string;
  client_id: string;
  zendesk_connection_id: string;
  status: "pending" | "running" | "completed" | "failed";
  phase: "tickets" | "ticket_metrics" | "agents" | "completed";
  tickets_after_cursor: string | null;
  ticket_metrics_after_cursor: string | null;
  agents_after_cursor: string | null;
  progress: {
    tickets?: number;
    ticket_metrics?: number;
    agents?: number;
  } | null;
};

type SyncRunRow = {
  id: string;
};

type SyncCounts = {
  tickets: number;
  ticketMetrics: number;
  agents: number;
  skippedMetrics: number;
};

type RunTrigger = "cron" | "manual";
type RunMode = "incremental" | "backfill";

type SyncConnectionOptions = {
  connectionId?: string;
  trigger: RunTrigger;
  mode?: RunMode;
  backfillPageBudget?: number;
};

const SYNC_LOCK_MINUTES = 15;
const INCREMENTAL_PAGE_BUDGET = 5;
const BACKFILL_PAGE_BUDGET = 2;
const WATERMARK_OVERLAP_SECONDS = 120;

function isoNow() {
  return new Date().toISOString();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function getUnixStartTime(iso: string | null) {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  return Math.max(0, Math.floor(date.getTime() / 1000) - WATERMARK_OVERLAP_SECONDS);
}

function parseIso(iso: string | null | undefined) {
  return iso ? new Date(iso).getTime() : null;
}

function maxIso(values: Array<string | null | undefined>) {
  const timestamps = values
    .map((value) => parseIso(value))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function channelFromTicket(ticket: ZendeskTicketRecord) {
  return ticket.via?.channel ?? null;
}

function numericMinutes(value?: { calendar?: number | null } | null) {
  return typeof value?.calendar === "number" ? value.calendar : null;
}

function buildCredentials(connection: ConnectionRow): ZendeskConnectionCredentials {
  if (!connection.access_token_encrypted) {
    throw new Error("Zendesk connection is missing access_token_encrypted.");
  }

  return {
    subdomain: connection.subdomain,
    credentialType: connection.credential_type,
    accessToken: connection.access_token_encrypted,
    apiUserEmail: connection.api_user_email
  };
}

async function getBackfill(
  supabase: AdminSupabaseClient,
  connectionId: string
): Promise<BackfillRow | null> {
  const { data, error } = await supabase
    .from("zendesk_backfills")
    .select(
      "id,client_id,zendesk_connection_id,status,phase,tickets_after_cursor,ticket_metrics_after_cursor,agents_after_cursor,progress"
    )
    .eq("zendesk_connection_id", connectionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as BackfillRow | null;
}

async function claimConnection(supabase: AdminSupabaseClient, connectionId: string) {
  const now = new Date();
  await supabase
    .from("zendesk_connections")
    .update({
      sync_status: "idle",
      sync_lock_expires_at: null
    })
    .eq("id", connectionId)
    .lt("sync_lock_expires_at", now.toISOString());

  const { data, error } = await supabase
    .from("zendesk_connections")
    .update({
      sync_status: "running",
      sync_lock_expires_at: addMinutes(now, SYNC_LOCK_MINUTES),
      last_sync_started_at: now.toISOString(),
      last_sync_error: null
    })
    .eq("id", connectionId)
    .neq("sync_status", "running")
    .select(
      "id,client_id,name,subdomain,access_token_encrypted,api_user_email,credential_type,status,sync_status,sync_lock_expires_at,last_synced_at,tickets_synced_through,ticket_metrics_synced_through,agents_synced_through"
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ConnectionRow | null;
}

async function createRun(
  supabase: AdminSupabaseClient,
  connection: ConnectionRow,
  trigger: RunTrigger,
  syncMode: RunMode
) {
  const { data, error } = await supabase
    .from("zendesk_sync_runs")
    .insert({
      client_id: connection.client_id,
      zendesk_connection_id: connection.id,
      trigger_source: trigger,
      sync_mode: syncMode
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data as SyncRunRow;
}

async function finalizeRun(
  supabase: AdminSupabaseClient,
  connection: ConnectionRow,
  runId: string,
  status: "succeeded" | "failed" | "partial",
  counts: SyncCounts,
  details: Record<string, Json>,
  updates: Partial<ConnectionRow>,
  errorMessage?: string
) {
  const completedAt = isoNow();

  const { error: runError } = await supabase
    .from("zendesk_sync_runs")
    .update({
      status,
      counts: {
        tickets: counts.tickets,
        ticket_metrics: counts.ticketMetrics,
        agents: counts.agents,
        skipped_metrics: counts.skippedMetrics
      },
      details,
      completed_at: completedAt,
      error_message: errorMessage ?? null
    })
    .eq("id", runId);

  if (runError) {
    throw runError;
  }

  const { error: connectionError } = await supabase
    .from("zendesk_connections")
    .update({
      sync_status: status === "failed" ? "error" : "idle",
      sync_lock_expires_at: null,
      last_sync_completed_at: completedAt,
      last_sync_status: status,
      last_sync_error: errorMessage ?? null,
      ...(status !== "failed" ? { last_synced_at: completedAt } : {}),
      ...updates
    })
    .eq("id", connection.id);

  if (connectionError) {
    throw connectionError;
  }
}

async function ensureBackfillRecord(
  supabase: AdminSupabaseClient,
  connection: ConnectionRow,
  reset = false
) {
  const payload = {
    client_id: connection.client_id,
    zendesk_connection_id: connection.id,
    status: "pending",
    phase: "tickets",
    started_at: null,
    completed_at: null,
    last_error: null,
    last_run_id: null,
    ...(reset
      ? {
          tickets_after_cursor: null,
          ticket_metrics_after_cursor: null,
          agents_after_cursor: null,
          progress: {
            tickets: 0,
            ticket_metrics: 0,
            agents: 0
          }
        }
      : {})
  };

  const { error } = await supabase.from("zendesk_backfills").upsert(payload, {
    onConflict: "zendesk_connection_id"
  });

  if (error) {
    throw error;
  }
}

async function upsertTickets(
  supabase: AdminSupabaseClient,
  connection: ConnectionRow,
  tickets: ZendeskTicketRecord[]
) {
  if (tickets.length === 0) {
    return { count: 0, maxUpdatedAt: null as string | null };
  }

  const rows = tickets.map((ticket) => ({
    client_id: connection.client_id,
    zendesk_connection_id: connection.id,
    zendesk_ticket_id: String(ticket.id),
    subject: ticket.subject ?? null,
    status: ticket.status ?? null,
    priority: ticket.priority ?? null,
    requester_email: ticket.requester?.email ?? null,
    created_at_source: ticket.created_at ?? null,
    updated_at_source: ticket.updated_at ?? null,
    channel: channelFromTicket(ticket),
    raw_payload: ticket,
    ingested_at: isoNow()
  }));

  const { error } = await supabase.from("tickets").upsert(rows, {
    onConflict: "zendesk_connection_id,zendesk_ticket_id"
  });

  if (error) {
    throw error;
  }

  return {
    count: tickets.length,
    maxUpdatedAt: maxIso(tickets.map((ticket) => ticket.updated_at))
  };
}

async function getTicketIdMap(
  supabase: AdminSupabaseClient,
  connectionId: string,
  zendeskTicketIds: string[]
) {
  if (zendeskTicketIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("tickets")
    .select("id,zendesk_ticket_id")
    .eq("zendesk_connection_id", connectionId)
    .in("zendesk_ticket_id", zendeskTicketIds);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((row) => [String(row.zendesk_ticket_id), row.id as string]));
}

async function upsertTicketMetrics(
  supabase: AdminSupabaseClient,
  connection: ConnectionRow,
  metrics: ZendeskTicketMetricRecord[]
) {
  if (metrics.length === 0) {
    return {
      count: 0,
      skippedCount: 0,
      maxUpdatedAt: null as string | null
    };
  }

  const ticketIds = await getTicketIdMap(
    supabase,
    connection.id,
    metrics.map((metric) => String(metric.ticket_id))
  );

  const rows = metrics
    .map((metric) => {
      const ticketId = ticketIds.get(String(metric.ticket_id));
      if (!ticketId) {
        return null;
      }

      return {
        ticket_id: ticketId,
        first_response_minutes: numericMinutes(metric.reply_time_in_minutes),
        full_resolution_minutes: numericMinutes(metric.full_resolution_time_in_minutes),
        handle_time_minutes: numericMinutes(metric.agent_wait_time_in_minutes),
        satisfaction_score: null,
        payload: metric,
        recorded_at: isoNow()
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length > 0) {
    const { error } = await supabase.from("ticket_metrics").upsert(rows, {
      onConflict: "ticket_id"
    });

    if (error) {
      throw error;
    }
  }

  return {
    count: rows.length,
    skippedCount: metrics.length - rows.length,
    maxUpdatedAt: maxIso(metrics.map((metric) => metric.updated_at))
  };
}

async function upsertAgents(
  supabase: AdminSupabaseClient,
  connection: ConnectionRow,
  agents: ZendeskUserRecord[]
) {
  if (agents.length === 0) {
    return { count: 0, maxUpdatedAt: null as string | null };
  }

  const rows = agents.map((agent) => ({
    client_id: connection.client_id,
    zendesk_connection_id: connection.id,
    zendesk_user_id: String(agent.id),
    name: agent.name ?? null,
    email: agent.email ?? null,
    role: agent.role ?? null,
    suspended: agent.suspended ?? null,
    active: agent.active ?? null,
    last_login_at: agent.last_login_at ?? null,
    created_at_source: agent.created_at ?? null,
    updated_at_source: agent.updated_at ?? null,
    raw_payload: agent,
    ingested_at: isoNow()
  }));

  const { error } = await supabase.from("zendesk_agents").upsert(rows, {
    onConflict: "zendesk_connection_id,zendesk_user_id"
  });

  if (error) {
    throw error;
  }

  return {
    count: agents.length,
    maxUpdatedAt: maxIso(agents.map((agent) => agent.updated_at))
  };
}

async function runIncrementalSync(
  supabase: AdminSupabaseClient,
  connection: ConnectionRow,
  client: ZendeskClient
) {
  const counts: SyncCounts = {
    tickets: 0,
    ticketMetrics: 0,
    agents: 0,
    skippedMetrics: 0
  };

  let ticketCursor: string | null = null;
  let ticketPages = 0;
  let ticketMaxUpdatedAt = connection.tickets_synced_through;

  while (ticketPages < INCREMENTAL_PAGE_BUDGET) {
    const page = await client.listTickets({
      afterCursor: ticketCursor,
      sort: "updated_at",
      startTime: getUnixStartTime(connection.tickets_synced_through)
    });

    const result = await upsertTickets(supabase, connection, page.records);
    counts.tickets += result.count;
    ticketMaxUpdatedAt = maxIso([ticketMaxUpdatedAt, result.maxUpdatedAt]);
    ticketCursor = page.afterCursor;
    ticketPages += 1;

    if (!page.hasMore) {
      break;
    }
  }

  let metricCursor: string | null = null;
  let metricPages = 0;
  let metricsMaxUpdatedAt = connection.ticket_metrics_synced_through;
  const metricsWatermarkMs = parseIso(connection.ticket_metrics_synced_through);

  while (metricPages < INCREMENTAL_PAGE_BUDGET) {
    const page = await client.listTicketMetrics({
      afterCursor: metricCursor,
      sort: "-updated_at"
    });

    const freshRecords = metricsWatermarkMs
      ? page.records.filter((metric) => {
          const updatedAt = parseIso(metric.updated_at);
          return updatedAt !== null && updatedAt > metricsWatermarkMs - WATERMARK_OVERLAP_SECONDS * 1000;
        })
      : page.records;

    const result = await upsertTicketMetrics(supabase, connection, freshRecords);
    counts.ticketMetrics += result.count;
    counts.skippedMetrics += result.skippedCount;
    metricsMaxUpdatedAt = maxIso([metricsMaxUpdatedAt, result.maxUpdatedAt]);
    metricCursor = page.afterCursor;
    metricPages += 1;

    const reachedWatermark =
      metricsWatermarkMs !== null &&
      page.records.every((metric) => {
        const updatedAt = parseIso(metric.updated_at);
        return updatedAt !== null && updatedAt <= metricsWatermarkMs;
      });

    if (!page.hasMore || reachedWatermark) {
      break;
    }
  }

  let agentCursor: string | null = null;
  let agentPages = 0;
  let agentsMaxUpdatedAt = connection.agents_synced_through;
  const agentsWatermarkMs = parseIso(connection.agents_synced_through);

  while (agentPages < INCREMENTAL_PAGE_BUDGET) {
    const page = await client.listAgentUsers({
      afterCursor: agentCursor,
      sort: "-updated_at"
    });

    const freshRecords = agentsWatermarkMs
      ? page.records.filter((agent) => {
          const updatedAt = parseIso(agent.updated_at);
          return updatedAt !== null && updatedAt > agentsWatermarkMs - WATERMARK_OVERLAP_SECONDS * 1000;
        })
      : page.records;

    const result = await upsertAgents(supabase, connection, freshRecords);
    counts.agents += result.count;
    agentsMaxUpdatedAt = maxIso([agentsMaxUpdatedAt, result.maxUpdatedAt]);
    agentCursor = page.afterCursor;
    agentPages += 1;

    const reachedWatermark =
      agentsWatermarkMs !== null &&
      page.records.every((agent) => {
        const updatedAt = parseIso(agent.updated_at);
        return updatedAt !== null && updatedAt <= agentsWatermarkMs;
      });

    if (!page.hasMore || reachedWatermark) {
      break;
    }
  }

  return {
    counts,
    details: {
      tickets_pages: ticketPages,
      ticket_metrics_pages: metricPages,
      agents_pages: agentPages
    },
    updates: {
      tickets_synced_through: ticketMaxUpdatedAt ?? isoNow(),
      ticket_metrics_synced_through: metricsMaxUpdatedAt ?? isoNow(),
      agents_synced_through: agentsMaxUpdatedAt ?? isoNow()
    }
  };
}

async function runBackfillSync(
  supabase: AdminSupabaseClient,
  connection: ConnectionRow,
  client: ZendeskClient,
  runId: string,
  pageBudget: number
) {
  const existingBackfill = await getBackfill(supabase, connection.id);
  if (!existingBackfill) {
    await ensureBackfillRecord(supabase, connection);
  }

  const backfill = (await getBackfill(supabase, connection.id)) as BackfillRow;

  const counts: SyncCounts = {
    tickets: 0,
    ticketMetrics: 0,
    agents: 0,
    skippedMetrics: 0
  };

  let phase = backfill.phase;
  let ticketsCursor = backfill.tickets_after_cursor;
  let metricsCursor = backfill.ticket_metrics_after_cursor;
  let agentsCursor = backfill.agents_after_cursor;
  const progress = {
    tickets: backfill.progress?.tickets ?? 0,
    ticket_metrics: backfill.progress?.ticket_metrics ?? 0,
    agents: backfill.progress?.agents ?? 0
  };

  await supabase
    .from("zendesk_backfills")
    .update({
      status: "running",
      started_at: isoNow(),
      last_error: null,
      last_run_id: runId
    })
    .eq("id", backfill.id);

  let pagesProcessed = 0;

  while (pagesProcessed < pageBudget && phase !== "completed") {
    if (phase === "tickets") {
      const page = await client.listTickets({
        afterCursor: ticketsCursor,
        sort: "updated_at"
      });
      const result = await upsertTickets(supabase, connection, page.records);
      counts.tickets += result.count;
      progress.tickets += result.count;
      pagesProcessed += 1;

      if (page.hasMore) {
        ticketsCursor = page.afterCursor;
      } else {
        phase = "ticket_metrics";
        ticketsCursor = null;
      }
      continue;
    }

    if (phase === "ticket_metrics") {
      const page = await client.listTicketMetrics({
        afterCursor: metricsCursor,
        sort: "updated_at"
      });
      const result = await upsertTicketMetrics(supabase, connection, page.records);
      counts.ticketMetrics += result.count;
      counts.skippedMetrics += result.skippedCount;
      progress.ticket_metrics += result.count;
      pagesProcessed += 1;

      if (page.hasMore) {
        metricsCursor = page.afterCursor;
      } else {
        phase = "agents";
        metricsCursor = null;
      }
      continue;
    }

    const page = await client.listAgentUsers({
      afterCursor: agentsCursor,
      sort: "updated_at"
    });
    const result = await upsertAgents(supabase, connection, page.records);
    counts.agents += result.count;
    progress.agents += result.count;
    pagesProcessed += 1;

    if (page.hasMore) {
      agentsCursor = page.afterCursor;
    } else {
      phase = "completed";
      agentsCursor = null;
    }
  }

  const isComplete = phase === "completed";

  const { error } = await supabase
    .from("zendesk_backfills")
    .update({
      status: isComplete ? "completed" : "running",
      phase,
      tickets_after_cursor: ticketsCursor,
      ticket_metrics_after_cursor: metricsCursor,
      agents_after_cursor: agentsCursor,
      completed_at: isComplete ? isoNow() : null,
      progress,
      last_run_id: runId
    })
    .eq("id", backfill.id);

  if (error) {
    throw error;
  }

  return {
    counts,
    details: {
      backfill_phase: phase,
      backfill_pages_processed: pagesProcessed,
      backfill_complete: isComplete
    },
    updates: isComplete
      ? {
          tickets_synced_through: connection.tickets_synced_through ?? isoNow(),
          ticket_metrics_synced_through: connection.ticket_metrics_synced_through ?? isoNow(),
          agents_synced_through: connection.agents_synced_through ?? isoNow()
        }
      : {}
  };
}

async function runConnectionSync(
  supabase: AdminSupabaseClient,
  connectionId: string,
  trigger: RunTrigger,
  requestedMode?: RunMode,
  backfillPageBudget = BACKFILL_PAGE_BUDGET
) {
  const connection = await claimConnection(supabase, connectionId);
  if (!connection) {
    return null;
  }

  if (connection.status !== "active") {
    await supabase
      .from("zendesk_connections")
      .update({
        sync_status: "error",
        sync_lock_expires_at: null,
        last_sync_error: "Only active Zendesk connections can be synced."
      })
      .eq("id", connection.id);
    return null;
  }

  const backfill = await getBackfill(supabase, connection.id);
  const syncMode =
    requestedMode ?? (backfill && backfill.status !== "completed" ? "backfill" : "incremental");
  const run = await createRun(supabase, connection, trigger, syncMode);

  try {
    const client = new ZendeskClient(buildCredentials(connection));
    const result =
      syncMode === "backfill"
        ? await runBackfillSync(supabase, connection, client, run.id, backfillPageBudget)
        : await runIncrementalSync(supabase, connection, client);

    await finalizeRun(
      supabase,
      connection,
      run.id,
      result.counts.skippedMetrics > 0 ? "partial" : "succeeded",
      result.counts,
      result.details,
      result.updates
    );

    return { runId: run.id, syncMode, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync failure.";

    if (syncMode === "backfill") {
      await supabase
        .from("zendesk_backfills")
        .update({
          status: "failed",
          last_error: message,
          last_run_id: run.id
        })
        .eq("zendesk_connection_id", connection.id);
    }

    await finalizeRun(
      supabase,
      connection,
      run.id,
      "failed",
      {
        tickets: 0,
        ticketMetrics: 0,
        agents: 0,
        skippedMetrics: 0
      },
      {},
      {},
      message
    );

    throw error;
  }
}

async function listEligibleConnections(
  supabase: AdminSupabaseClient,
  connectionId?: string
) {
  let query = supabase
    .from("zendesk_connections")
    .select(
      "id,client_id,name,subdomain,access_token_encrypted,api_user_email,credential_type,status,sync_status,sync_lock_expires_at,last_synced_at,tickets_synced_through,ticket_metrics_synced_through,agents_synced_through"
    )
    .eq("status", "active")
    .order("last_synced_at", { ascending: true, nullsFirst: true });

  if (connectionId) {
    query = query.eq("id", connectionId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as ConnectionRow[];
}

export async function enqueueZendeskBackfill(connectionId: string, reset = false) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("zendesk_connections")
    .select(
      "id,client_id,name,subdomain,access_token_encrypted,api_user_email,credential_type,status,sync_status,sync_lock_expires_at,last_synced_at,tickets_synced_through,ticket_metrics_synced_through,agents_synced_through"
    )
    .eq("id", connectionId)
    .single();

  if (error) {
    throw error;
  }

  await ensureBackfillRecord(supabase, data as ConnectionRow, reset);
}

export async function runZendeskSyncJob(options: SyncConnectionOptions) {
  const supabase = createAdminSupabaseClient();
  const connections = await listEligibleConnections(supabase, options.connectionId);
  const results = [];

  for (const connection of connections.slice(0, options.connectionId ? 1 : 3)) {
    const result = await runConnectionSync(
      supabase,
      connection.id,
      options.trigger,
      options.mode,
      options.backfillPageBudget
    );

    if (result) {
      results.push({
        connectionId: connection.id,
        ...result
      });
    }
  }

  return results;
}
