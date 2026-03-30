import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ConnecteamClient, type ConnecteamMeResponse } from "@/lib/connecteam/client";

type ConnectionMetadata = {
  account?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    timezone?: string | null;
    country?: string | null;
  };
  [key: string]: unknown;
};

export type ConnecteamConnectionRow = {
  id: string;
  client_id: string | null;
  name: string;
  connection_scope: "client" | "shared";
  credential_type: "api_key";
  external_account_id: string | null;
  access_token_encrypted: string | null;
  status: "active" | "disconnected" | "error";
  metadata: ConnectionMetadata | null;
  last_validated_at: string | null;
  last_validation_status: "succeeded" | "failed" | null;
  last_validation_error: string | null;
  last_synced_at: string | null;
};

function normalizeMetadata(metadata: ConnectionMetadata | null | undefined): ConnectionMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

function normalizeApiKey(value: string) {
  return value.trim();
}

function readAccountId(me: ConnecteamMeResponse) {
  const candidate = me.accountId ?? me.id ?? null;
  return candidate === null || candidate === undefined ? null : String(candidate);
}

function readAccountName(me: ConnecteamMeResponse) {
  if (typeof me.companyName === "string" && me.companyName.trim()) {
    return me.companyName.trim();
  }

  if (typeof me.name === "string" && me.name.trim()) {
    return me.name.trim();
  }

  return null;
}

async function persistValidationSuccess(connection: ConnecteamConnectionRow, me: ConnecteamMeResponse) {
  const supabase = createAdminSupabaseClient();
  const metadata = normalizeMetadata(connection.metadata);
  const updates = {
    credential_type: "api_key" as const,
    status: "active" as const,
    external_account_id: readAccountId(me),
    metadata: {
      ...metadata,
      account: {
        ...(metadata.account ?? {}),
        id: readAccountId(me),
        name: readAccountName(me),
        email: typeof me.email === "string" ? me.email : null,
        timezone: typeof me.timezone === "string" ? me.timezone : null,
        country: typeof me.country === "string" ? me.country : null
      },
      me
    },
    last_validated_at: new Date().toISOString(),
    last_validation_status: "succeeded" as const,
    last_validation_error: null
  };

  const { error } = await supabase.from("connecteam_connections").update(updates).eq("id", connection.id);
  if (error) {
    throw error;
  }
}

async function persistValidationFailure(connectionId: string, message: string, disconnect = false) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("connecteam_connections")
    .update({
      status: disconnect ? ("disconnected" as const) : ("error" as const),
      last_validated_at: new Date().toISOString(),
      last_validation_status: "failed" as const,
      last_validation_error: message
    })
    .eq("id", connectionId);

  if (error) {
    throw error;
  }
}

export function getConnecteamClient(apiKey: string) {
  return new ConnecteamClient(normalizeApiKey(apiKey));
}

export async function validateConnecteamApiKey(connection: ConnecteamConnectionRow) {
  if (!connection.access_token_encrypted) {
    throw new Error("Connecteam connection is missing an API key.");
  }

  try {
    const me = await getConnecteamClient(connection.access_token_encrypted).getMe();
    await persistValidationSuccess(connection, me);
    return me;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Connecteam validation error.";
    await persistValidationFailure(connection.id, message);
    throw new Error(message);
  }
}

export async function testConnecteamConnection(connectionId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("connecteam_connections")
    .select(
      "id,client_id,name,connection_scope,credential_type,external_account_id,access_token_encrypted,status,metadata,last_validated_at,last_validation_status,last_validation_error,last_synced_at"
    )
    .eq("id", connectionId)
    .single();

  if (error) {
    throw error;
  }

  return validateConnecteamApiKey(data as ConnecteamConnectionRow);
}

export async function disconnectConnecteamConnection(connectionId: string) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("connecteam_connections")
    .update({
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      external_account_id: null,
      status: "disconnected",
      last_validated_at: null,
      last_validation_status: null,
      last_validation_error: null
    })
    .eq("id", connectionId);

  if (error) {
    throw error;
  }
}
