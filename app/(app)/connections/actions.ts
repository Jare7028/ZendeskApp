"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentUserContext } from "@/lib/auth/session";
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

export async function createZendeskConnectionAction(formData: FormData) {
  const context = await requireAdmin();
  const supabase = createServerSupabaseClient().schema("app");
  const clientId = String(formData.get("clientId") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();
  const subdomain = normalizeZendeskSubdomain(String(formData.get("subdomain") ?? ""));

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
    credential_type: "oauth_token" as const
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
