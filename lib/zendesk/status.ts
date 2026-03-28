import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type ConnectionStatusRow = {
  id: string;
  client_id: string;
  name: string;
  subdomain: string;
  status: string;
  sync_status: string;
  last_synced_at: string | null;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  tickets_synced_through: string | null;
  ticket_metrics_synced_through: string | null;
  agents_synced_through: string | null;
};

type SyncRunRow = {
  id: string;
  zendesk_connection_id: string;
  trigger_source: string;
  sync_mode: string;
  status: string;
  counts: Record<string, number> | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type BackfillRow = {
  zendesk_connection_id: string;
  status: string;
  phase: string;
  progress: Record<string, number> | null;
  updated_at: string;
  completed_at: string | null;
  last_error: string | null;
};

export async function getZendeskConnectionStatus() {
  const supabase = createServerSupabaseClient().schema("app");
  const [{ data: connections, error: connectionsError }, { data: runs, error: runsError }, { data: backfills, error: backfillsError }] =
    await Promise.all([
      supabase
        .from("zendesk_connections")
        .select(
          "id,client_id,name,subdomain,status,sync_status,last_synced_at,last_sync_started_at,last_sync_completed_at,last_sync_status,last_sync_error,tickets_synced_through,ticket_metrics_synced_through,agents_synced_through"
        )
        .order("name"),
      supabase
        .from("zendesk_sync_runs")
        .select(
          "id,zendesk_connection_id,trigger_source,sync_mode,status,counts,started_at,completed_at,error_message"
        )
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("zendesk_backfills")
        .select("zendesk_connection_id,status,phase,progress,updated_at,completed_at,last_error")
    ]);

  if (connectionsError) {
    throw connectionsError;
  }

  if (runsError) {
    throw runsError;
  }

  if (backfillsError) {
    throw backfillsError;
  }

  const latestRunByConnection = new Map<string, SyncRunRow>();
  for (const run of (runs ?? []) as SyncRunRow[]) {
    if (!latestRunByConnection.has(run.zendesk_connection_id)) {
      latestRunByConnection.set(run.zendesk_connection_id, run);
    }
  }

  const backfillByConnection = new Map(
    ((backfills ?? []) as BackfillRow[]).map((backfill) => [backfill.zendesk_connection_id, backfill])
  );

  return ((connections ?? []) as ConnectionStatusRow[]).map((connection) => ({
    ...connection,
    latestRun: latestRunByConnection.get(connection.id) ?? null,
    backfill: backfillByConnection.get(connection.id) ?? null
  }));
}
