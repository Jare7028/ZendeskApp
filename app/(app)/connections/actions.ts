"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentUserContext } from "@/lib/auth/session";
import { mergeSlaConfigMetadata } from "@/lib/sla/config";
import {
  disconnectConnecteamConnection,
  testConnecteamConnection
} from "@/lib/connecteam/connection";
import { runConnecteamPostConnectionSync, saveZendeskConnecteamSchedule } from "@/lib/connecteam/sync";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  disconnectZendeskConnection,
  normalizeZendeskSubdomain,
  testZendeskConnection
} from "@/lib/zendesk/oauth";

function buildConnectionsRedirect(status: string, detail?: string) {
  const search = new URLSearchParams({ connection: status });

  if (detail) {
    search.set("detail", detail);
  }

  return `/connections?${search.toString()}`;
}

async function requireAdmin() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  if (context.role !== "admin") {
    redirect("/dashboard");
  }

  return context;
}

export async function createClientAction(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/connections?connection=missing-client-name");
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const supabase = createServerSupabaseClient().schema("app");

  const { data: existingClient, error: existingClientError } = await supabase
    .from("clients")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingClientError) {
    redirect(buildConnectionsRedirect("client-create-failed", existingClientError.message));
  }

  if (existingClient?.id) {
    redirect(buildConnectionsRedirect("client-already-exists"));
  }

  const adminSupabase = createAdminSupabaseClient();
  const { error } = await adminSupabase.from("clients").insert({ name, slug });

  if (error) {
    redirect(buildConnectionsRedirect("client-create-failed", error.message));
  }

  revalidatePath("/connections");
  redirect(buildConnectionsRedirect("client-created"));
}

export async function createZendeskConnectionAction(formData: FormData) {
  const context = await requireAdmin();
  const supabase = createServerSupabaseClient().schema("app");
  const clientId = String(formData.get("clientId") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();
  const subdomain = normalizeZendeskSubdomain(String(formData.get("subdomain") ?? ""));
  const oauthClientId = String(formData.get("oauthClientId") ?? "").trim() || null;
  const oauthClientSecret = String(formData.get("oauthClientSecret") ?? "").trim() || null;

  if (!clientId) {
    redirect(buildConnectionsRedirect("missing-client"));
  }

  if (!subdomain) {
    redirect(buildConnectionsRedirect("missing-subdomain"));
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id,name")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    redirect(buildConnectionsRedirect("invalid-client"));
  }

  const name = rawName || String(client.name ?? "").trim();

  if (!name) {
    redirect(buildConnectionsRedirect("missing-name"));
  }

  if ((oauthClientId && !oauthClientSecret) || (!oauthClientId && oauthClientSecret)) {
    redirect(buildConnectionsRedirect("oauth-client-config-invalid"));
  }

  const { data: existing, error: existingError } = await supabase
    .from("zendesk_connections")
    .select("id")
    .eq("client_id", clientId)
    .eq("subdomain", subdomain)
    .maybeSingle();

  if (existingError) {
    redirect(buildConnectionsRedirect("save-failed", existingError.message));
  }

  const payload = {
    client_id: clientId,
    name,
    subdomain,
    created_by: context.userId,
    credential_type: "oauth_token" as const,
    oauth_client_id: oauthClientId,
    oauth_client_secret_encrypted: oauthClientSecret
  };

  const result = existing?.id
    ? await supabase.from("zendesk_connections").update(payload).eq("id", existing.id).select("id").single()
    : await supabase.from("zendesk_connections").insert(payload).select("id").single();

  if (result.error) {
    redirect(buildConnectionsRedirect("save-failed", result.error.message));
  }

  const connectionId = result.data?.id;

  if (!connectionId) {
    redirect(buildConnectionsRedirect("save-failed"));
  }

  revalidatePath("/connections");
  redirect(`/api/zendesk/oauth/start?connection_id=${encodeURIComponent(connectionId)}`);
}

export async function createConnecteamConnectionAction(formData: FormData) {
  const context = await requireAdmin();
  const supabase = createServerSupabaseClient().schema("app");
  const rawName = String(formData.get("name") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (!apiKey) {
    redirect(buildConnectionsRedirect("connecteam-missing-api-key"));
  }

  const name = rawName || "Shared Connecteam account";

  if (!name) {
    redirect(buildConnectionsRedirect("missing-name"));
  }

  const { data: existing, error: existingError } = await supabase
    .from("connecteam_connections")
    .select("id")
    .eq("connection_scope", "shared")
    .maybeSingle();

  if (existingError) {
    redirect(buildConnectionsRedirect("connecteam-save-failed", existingError.message));
  }

  const payload = {
    client_id: null,
    name,
    connection_scope: "shared" as const,
    credential_type: "api_key" as const,
    access_token_encrypted: apiKey,
    created_by: context.userId,
    status: "disconnected" as const,
    metadata: {},
    last_validated_at: null,
    last_validation_status: null,
    last_validation_error: null,
    external_account_id: null
  };

  const result = existing?.id
    ? await supabase.from("connecteam_connections").update(payload).eq("id", existing.id).select("id").single()
    : await supabase.from("connecteam_connections").insert(payload).select("id").single();

  if (result.error) {
    redirect(buildConnectionsRedirect("connecteam-save-failed", result.error.message));
  }

  const connectionId = result.data?.id;

  if (!connectionId) {
    redirect(buildConnectionsRedirect("connecteam-save-failed"));
  }

  try {
    await testConnecteamConnection(connectionId);

    try {
      await runConnecteamPostConnectionSync(connectionId);
      revalidatePath("/connections");
      revalidatePath("/admin");
      redirect(buildConnectionsRedirect("connecteam-connected-sync-started"));
    } catch (error) {
      revalidatePath("/connections");
      revalidatePath("/admin");
      redirect(
        buildConnectionsRedirect(
          "connecteam-connected-sync-failed",
          error instanceof Error ? error.message : undefined
        )
      );
    }
  } catch (error) {
    revalidatePath("/connections");
    redirect(
      buildConnectionsRedirect(
        "connecteam-test-failed",
        error instanceof Error ? error.message : undefined
      )
    );
  }
}

export async function saveZendeskConnecteamScheduleAction(formData: FormData) {
  await requireAdmin();

  const clientId = String(formData.get("clientId") ?? "").trim();
  const zendeskConnectionId = String(formData.get("zendeskConnectionId") ?? "").trim();
  const connecteamConnectionId = String(formData.get("connecteamConnectionId") ?? "").trim();
  const schedulerIdRaw = String(formData.get("schedulerId") ?? "").trim();

  if (!clientId || !zendeskConnectionId || !connecteamConnectionId) {
    redirect(buildConnectionsRedirect("connecteam-schedule-save-failed", "Missing schedule assignment fields."));
  }

  try {
    await saveZendeskConnecteamSchedule({
      clientId,
      zendeskConnectionId,
      connecteamConnectionId,
      schedulerId: schedulerIdRaw || null
    });
    revalidatePath("/connections");
    revalidatePath("/admin");
    redirect(buildConnectionsRedirect("connecteam-schedule-saved"));
  } catch (error) {
    revalidatePath("/connections");
    redirect(
      buildConnectionsRedirect(
        "connecteam-schedule-save-failed",
        error instanceof Error ? error.message : undefined
      )
    );
  }
}

export async function testZendeskConnectionAction(formData: FormData) {
  await requireAdmin();
  const connectionId = String(formData.get("connectionId") ?? "").trim();

  if (!connectionId) {
    redirect(buildConnectionsRedirect("missing-connection"));
  }

  try {
    await testZendeskConnection(connectionId);
    revalidatePath("/connections");
    redirect(buildConnectionsRedirect("tested"));
  } catch (error) {
    revalidatePath("/connections");
    redirect(buildConnectionsRedirect("test-failed", error instanceof Error ? error.message : undefined));
  }
}

export async function reauthZendeskConnectionAction(formData: FormData) {
  await requireAdmin();
  const connectionId = String(formData.get("connectionId") ?? "").trim();

  if (!connectionId) {
    redirect(buildConnectionsRedirect("missing-connection"));
  }

  redirect(`/api/zendesk/oauth/start?connection_id=${encodeURIComponent(connectionId)}`);
}

export async function disconnectZendeskConnectionAction(formData: FormData) {
  await requireAdmin();
  const connectionId = String(formData.get("connectionId") ?? "").trim();

  if (!connectionId) {
    redirect(buildConnectionsRedirect("missing-connection"));
  }

  await disconnectZendeskConnection(connectionId);
  revalidatePath("/connections");
  redirect(buildConnectionsRedirect("disconnected"));
}

export async function testConnecteamConnectionAction(formData: FormData) {
  await requireAdmin();
  const connectionId = String(formData.get("connectionId") ?? "").trim();

  if (!connectionId) {
    redirect(buildConnectionsRedirect("missing-connection"));
  }

  try {
    await testConnecteamConnection(connectionId);
    revalidatePath("/connections");
    redirect(buildConnectionsRedirect("connecteam-tested"));
  } catch (error) {
    revalidatePath("/connections");
    redirect(
      buildConnectionsRedirect(
        "connecteam-test-failed",
        error instanceof Error ? error.message : undefined
      )
    );
  }
}

export async function disconnectConnecteamConnectionAction(formData: FormData) {
  await requireAdmin();
  const connectionId = String(formData.get("connectionId") ?? "").trim();

  if (!connectionId) {
    redirect(buildConnectionsRedirect("missing-connection"));
  }

  await disconnectConnecteamConnection(connectionId);
  revalidatePath("/connections");
  redirect(buildConnectionsRedirect("connecteam-disconnected"));
}

export async function saveZendeskSlaConfigAction(formData: FormData) {
  await requireAdmin();
  const supabase = createServerSupabaseClient().schema("app");
  const connectionId = String(formData.get("connectionId") ?? "").trim();
  const firstReplyTargetMinutes = Number.parseInt(String(formData.get("firstReplyTargetMinutes") ?? ""), 10);
  const fullResolutionTargetMinutes = Number.parseInt(String(formData.get("fullResolutionTargetMinutes") ?? ""), 10);
  const alertThresholdPercent = Number.parseFloat(String(formData.get("alertThresholdPercent") ?? ""));
  const alertsEnabled = String(formData.get("alertsEnabled") ?? "") === "on";

  if (!connectionId) {
    redirect(buildConnectionsRedirect("missing-connection"));
  }

  if (
    !Number.isFinite(firstReplyTargetMinutes) ||
    firstReplyTargetMinutes <= 0 ||
    !Number.isFinite(fullResolutionTargetMinutes) ||
    fullResolutionTargetMinutes <= 0 ||
    !Number.isFinite(alertThresholdPercent) ||
    alertThresholdPercent < 0 ||
    alertThresholdPercent > 100
  ) {
    redirect(buildConnectionsRedirect("sla-invalid"));
  }

  const { data: connection, error: connectionError } = await supabase
    .from("zendesk_connections")
    .select("id,metadata")
    .eq("id", connectionId)
    .single();

  if (connectionError || !connection) {
    redirect(buildConnectionsRedirect("missing-connection"));
  }

  const { error: updateError } = await supabase
    .from("zendesk_connections")
    .update({
      metadata: mergeSlaConfigMetadata(connection.metadata as Record<string, unknown> | null, {
        firstReplyTargetMinutes,
        fullResolutionTargetMinutes,
        alertThresholdPercent,
        alertsEnabled,
        cooldownMinutes: 360
      })
    })
    .eq("id", connectionId);

  if (updateError) {
    redirect(buildConnectionsRedirect("sla-save-failed", updateError.message));
  }

  revalidatePath("/connections");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  redirect(buildConnectionsRedirect("sla-saved"));
}
