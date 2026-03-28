import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type ConnectionStatusRow = {
  id: string;
  client_id: string;
  name: string;
  credential_type: string;
  external_account_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  last_validated_at: string | null;
  last_validation_status: string | null;
  last_validation_error: string | null;
  last_synced_at: string | null;
  created_at: string;
};

export async function getConnecteamConnectionStatus() {
  const supabase = createServerSupabaseClient().schema("app");
  const [{ data: clients, error: clientsError }, { data: connections, error: connectionsError }] = await Promise.all([
    supabase.from("clients").select("id,name,slug").order("name"),
    supabase
      .from("connecteam_connections")
      .select(
        "id,client_id,name,credential_type,external_account_id,status,metadata,last_validated_at,last_validation_status,last_validation_error,last_synced_at,created_at"
      )
      .order("name")
  ]);

  if (clientsError) {
    throw clientsError;
  }

  if (connectionsError) {
    throw connectionsError;
  }

  const clientById = new Map(
    ((clients ?? []) as Array<{ id: string; name: string; slug: string }>).map((client) => [client.id, client])
  );

  return ((connections ?? []) as ConnectionStatusRow[]).map((connection) => ({
    ...connection,
    client: clientById.get(connection.client_id) ?? null
  }));
}
