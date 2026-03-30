import "server-only";

import { randomBytes } from "crypto";

import {
  getBaseUrl,
  getZendeskOauthClientId,
  getZendeskOauthClientSecret,
  getZendeskOauthScopes
} from "@/lib/config/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { type ZendeskConnectionCredentials } from "@/lib/zendesk/client";

type ConnectionMetadata = {
  oauth?: {
    scopes?: string[];
    token_endpoint_subdomain?: string;
    account_subdomain?: string;
    user?: {
      id?: number;
      email?: string | null;
      name?: string | null;
      role?: string | null;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ZendeskCredentialRow = {
  id: string;
  subdomain: string;
  credential_type: "api_token" | "oauth_token";
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  api_user_email: string | null;
  token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  token_type: string | null;
  status: "active" | "disconnected" | "error";
  external_account_id: string | null;
  metadata: ConnectionMetadata | null;
  last_validated_at?: string | null;
  last_validation_status?: "succeeded" | "failed" | null;
  last_validation_error?: string | null;
};

type OAuthStateRow = ZendeskCredentialRow & {
  name: string;
  oauth_state: string | null;
  oauth_state_expires_at: string | null;
};

type ZendeskTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  scopes?: string[];
  expires_in?: number | null;
  refresh_token_expires_in?: number | null;
};

type ZendeskMeResponse = {
  user?: {
    id?: number;
    email?: string | null;
    name?: string | null;
    role?: string | null;
  };
};

const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function addSeconds(base: Date, seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(base.getTime() + seconds * 1000).toISOString();
}

function buildConnectionsRedirect(pathname: string, status: string, detail?: string) {
  const url = new URL(pathname, getBaseUrl());
  url.searchParams.set("connection", status);

  if (detail) {
    url.searchParams.set("detail", detail);
  }

  return url;
}

function getZendeskCallbackUrl() {
  return `${getBaseUrl()}/auth/callback/zendesk`;
}

function buildTokenUrl(subdomain: string) {
  return `https://${subdomain}.zendesk.com/oauth/tokens`;
}

function buildMeUrl(subdomain: string) {
  return `https://${subdomain}.zendesk.com/api/v2/users/me.json`;
}

function getScopes() {
  return getZendeskOauthScopes()
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Zendesk OAuth error.";
}

function normalizeMetadata(metadata: ConnectionMetadata | null | undefined): ConnectionMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

function normalizeTokenType(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "bearer";
}

function tryParseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function normalizeZendeskSubdomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.zendesk\.com.*$/, "")
    .replace(/[^a-z0-9-]/g, "");
}

function validateZendeskSubdomain(value: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error("Zendesk subdomains may only contain lowercase letters, numbers, and hyphens.");
  }
}

async function requestZendeskTokens(
  subdomain: string,
  payload: Record<string, string>
): Promise<ZendeskTokenResponse> {
  const response = await fetch(buildTokenUrl(subdomain), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const bodyText = await response.text();
  const body = (bodyText ? tryParseJson<ZendeskTokenResponse & { error?: string }>(bodyText) : null) ?? {};

  if (!response.ok) {
    const detail =
      typeof body.error === "string" && body.error
        ? body.error
        : bodyText || `Zendesk token exchange failed with status ${response.status}.`;
    throw new Error(detail);
  }

  if (!body.access_token) {
    throw new Error("Zendesk did not return an access token.");
  }

  return body;
}

async function fetchZendeskCurrentUser(subdomain: string, accessToken: string) {
  const response = await fetch(buildMeUrl(subdomain), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  const bodyText = await response.text();
  const body = (bodyText ? tryParseJson<ZendeskMeResponse & { error?: string }>(bodyText) : null) ?? {};

  if (!response.ok) {
    const detail =
      typeof body.error === "string" && body.error
        ? body.error
        : bodyText || `Zendesk validation failed with status ${response.status}.`;
    throw new Error(detail);
  }

  return body.user ?? {};
}

async function persistZendeskTokens(
  connection: ZendeskCredentialRow,
  tokenResponse: ZendeskTokenResponse,
  options?: {
    validatedUser?: ZendeskMeResponse["user"];
    clearOauthState?: boolean;
    validatedAt?: string;
  }
) {
  const supabase = createAdminSupabaseClient();
  const now = new Date();
  const metadata = normalizeMetadata(connection.metadata);
  const scopes = Array.isArray(tokenResponse.scopes)
    ? tokenResponse.scopes.filter((scope): scope is string => typeof scope === "string")
    : typeof tokenResponse.scope === "string"
      ? tokenResponse.scope.split(/\s+/).filter(Boolean)
      : metadata.oauth?.scopes ?? [];

  const mergedMetadata: ConnectionMetadata = {
    ...metadata,
    oauth: {
      ...(metadata.oauth ?? {}),
      scopes,
      token_endpoint_subdomain: connection.subdomain,
      account_subdomain: connection.subdomain,
      user: options?.validatedUser
        ? {
            id: options.validatedUser.id,
            email: options.validatedUser.email ?? null,
            name: options.validatedUser.name ?? null,
            role: options.validatedUser.role ?? null
          }
        : (metadata.oauth?.user ?? {})
    }
  };

  const updates = {
    credential_type: "oauth_token" as const,
    access_token_encrypted: tokenResponse.access_token ?? connection.access_token_encrypted,
    refresh_token_encrypted: tokenResponse.refresh_token ?? connection.refresh_token_encrypted,
    token_type: normalizeTokenType(tokenResponse.token_type),
    token_expires_at: addSeconds(now, tokenResponse.expires_in) ?? connection.token_expires_at,
    refresh_token_expires_at:
      addSeconds(now, tokenResponse.refresh_token_expires_in) ?? connection.refresh_token_expires_at,
    status: "active" as const,
    external_account_id:
      options?.validatedUser?.id !== undefined
        ? String(options.validatedUser.id)
        : connection.external_account_id,
    metadata: mergedMetadata,
    last_validation_status: options?.validatedAt ? ("succeeded" as const) : connection.last_validation_status ?? null,
    last_validation_error: options?.validatedAt ? null : connection.last_validation_error ?? null,
    last_validated_at: options?.validatedAt ?? connection.last_validated_at ?? null,
    ...(options?.clearOauthState ? { oauth_state: null, oauth_state_expires_at: null } : {})
  };

  const { data, error } = await supabase
    .from("zendesk_connections")
    .update(updates)
    .eq("id", connection.id)
    .select(
      "id,subdomain,credential_type,access_token_encrypted,refresh_token_encrypted,api_user_email,token_expires_at,refresh_token_expires_at,token_type,status,external_account_id,metadata,last_validated_at,last_validation_status,last_validation_error"
    )
    .single();

  if (error) {
    throw error;
  }

  return data as ZendeskCredentialRow;
}

async function markValidationFailure(
  connectionId: string,
  message: string,
  options?: { clearOauthState?: boolean; disconnect?: boolean }
) {
  const supabase = createAdminSupabaseClient();
  const updates = {
    status: options?.disconnect ? ("disconnected" as const) : ("error" as const),
    last_validation_status: "failed" as const,
    last_validation_error: message,
    last_validated_at: new Date().toISOString(),
    ...(options?.clearOauthState ? { oauth_state: null, oauth_state_expires_at: null } : {})
  };

  const { error } = await supabase.from("zendesk_connections").update(updates).eq("id", connectionId);

  if (error) {
    throw error;
  }
}

async function refreshZendeskTokens(connection: ZendeskCredentialRow) {
  if (!connection.refresh_token_encrypted) {
    throw new Error("Zendesk connection does not have a refresh token. Re-authorize this connection.");
  }

  try {
    const tokenResponse = await requestZendeskTokens(connection.subdomain, {
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token_encrypted,
      client_id: getZendeskOauthClientId(),
      client_secret: getZendeskOauthClientSecret()
    });

    return await persistZendeskTokens(connection, tokenResponse);
  } catch (error) {
    const message = toErrorMessage(error);
    await markValidationFailure(connection.id, message);
    throw new Error(message);
  }
}

function shouldRefreshOAuthToken(connection: ZendeskCredentialRow, forceRefresh = false) {
  if (connection.credential_type !== "oauth_token" || !connection.refresh_token_encrypted) {
    return false;
  }

  if (forceRefresh) {
    return true;
  }

  if (!connection.token_expires_at) {
    return true;
  }

  return new Date(connection.token_expires_at).getTime() <= Date.now() + TOKEN_REFRESH_SKEW_MS;
}

export async function ensureValidZendeskCredentials(
  connection: ZendeskCredentialRow,
  options?: { forceRefresh?: boolean }
): Promise<ZendeskConnectionCredentials> {
  const usableConnection =
    shouldRefreshOAuthToken(connection, options?.forceRefresh) && connection.credential_type === "oauth_token"
      ? await refreshZendeskTokens(connection)
      : connection;

  if (!usableConnection.access_token_encrypted) {
    throw new Error("Zendesk connection is missing an access token.");
  }

  return {
    subdomain: usableConnection.subdomain,
    credentialType: usableConnection.credential_type,
    accessToken: usableConnection.access_token_encrypted,
    apiUserEmail: usableConnection.api_user_email
  };
}

export async function beginZendeskOAuth(connectionId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("zendesk_connections")
    .select("id,subdomain")
    .eq("id", connectionId)
    .single();

  if (error) {
    throw error;
  }

  const state = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  const subdomain = normalizeZendeskSubdomain(String(data.subdomain ?? ""));

  validateZendeskSubdomain(subdomain);

  const { error: updateError } = await supabase
    .from("zendesk_connections")
    .update({
      subdomain,
      oauth_state: state,
      oauth_state_expires_at: expiresAt,
      credential_type: "oauth_token"
    })
    .eq("id", connectionId);

  if (updateError) {
    throw updateError;
  }

  const authorizeUrl = new URL(`https://${subdomain}.zendesk.com/oauth/authorizations/new`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", getZendeskOauthClientId());
  authorizeUrl.searchParams.set("redirect_uri", getZendeskCallbackUrl());
  authorizeUrl.searchParams.set("scope", getScopes().join(" "));
  authorizeUrl.searchParams.set("state", state);

  return authorizeUrl.toString();
}

export async function completeZendeskOAuthCallback(params: {
  state: string | null;
  code: string | null;
  error: string | null;
  errorDescription: string | null;
}) {
  if (!params.state) {
    return buildConnectionsRedirect("/connections", "oauth-missing-state");
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("zendesk_connections")
    .select(
      "id,name,subdomain,credential_type,access_token_encrypted,refresh_token_encrypted,api_user_email,token_expires_at,refresh_token_expires_at,token_type,status,external_account_id,metadata,last_validated_at,last_validation_status,last_validation_error,oauth_state,oauth_state_expires_at"
    )
    .eq("oauth_state", params.state)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const connection = data as OAuthStateRow | null;

  if (!connection) {
    return buildConnectionsRedirect("/connections", "oauth-invalid-state");
  }

  if (
    !connection.oauth_state_expires_at ||
    new Date(connection.oauth_state_expires_at).getTime() < Date.now()
  ) {
    await markValidationFailure(connection.id, "Zendesk authorization state expired. Start the flow again.", {
      clearOauthState: true,
      disconnect: connection.status !== "active"
    });
    return buildConnectionsRedirect("/connections", "oauth-expired", connection.name);
  }

  if (params.error) {
    const message = params.errorDescription || params.error;
    await markValidationFailure(connection.id, message, {
      clearOauthState: true,
      disconnect: connection.status !== "active"
    });
    return buildConnectionsRedirect("/connections", "oauth-denied", connection.name);
  }

  if (!params.code) {
    await markValidationFailure(connection.id, "Zendesk did not return an authorization code.", {
      clearOauthState: true,
      disconnect: connection.status !== "active"
    });
    return buildConnectionsRedirect("/connections", "oauth-missing-code", connection.name);
  }

  try {
    const tokenResponse = await requestZendeskTokens(connection.subdomain, {
      grant_type: "authorization_code",
      code: params.code,
      client_id: getZendeskOauthClientId(),
      client_secret: getZendeskOauthClientSecret(),
      redirect_uri: getZendeskCallbackUrl()
    });
    const validatedAt = new Date().toISOString();
    const validatedUser = await fetchZendeskCurrentUser(connection.subdomain, tokenResponse.access_token ?? "");

    await persistZendeskTokens(connection, tokenResponse, {
      validatedUser,
      validatedAt,
      clearOauthState: true
    });

    return buildConnectionsRedirect("/connections", "connected", connection.name);
  } catch (error) {
    const message = toErrorMessage(error);
    await markValidationFailure(connection.id, message, {
      clearOauthState: true,
      disconnect: connection.status !== "active"
    });
    return buildConnectionsRedirect("/connections", "oauth-failed", connection.name);
  }
}

export async function testZendeskConnection(connectionId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("zendesk_connections")
    .select(
      "id,subdomain,credential_type,access_token_encrypted,refresh_token_encrypted,api_user_email,token_expires_at,refresh_token_expires_at,token_type,status,external_account_id,metadata,last_validated_at,last_validation_status,last_validation_error"
    )
    .eq("id", connectionId)
    .single();

  if (error) {
    throw error;
  }

  const connection = data as ZendeskCredentialRow;
  const credentials = await ensureValidZendeskCredentials(connection);
  const user = await fetchZendeskCurrentUser(connection.subdomain, credentials.accessToken);

  await persistZendeskTokens(connection, {
    access_token: credentials.accessToken,
    refresh_token: connection.refresh_token_encrypted ?? undefined,
    token_type: connection.token_type ?? "bearer"
  }, {
    validatedUser: user,
    validatedAt: new Date().toISOString()
  });

  return user;
}

export async function disconnectZendeskConnection(connectionId: string) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("zendesk_connections")
    .update({
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_type: null,
      token_expires_at: null,
      refresh_token_expires_at: null,
      oauth_state: null,
      oauth_state_expires_at: null,
      status: "disconnected",
      last_validation_error: null
    })
    .eq("id", connectionId);

  if (error) {
    throw error;
  }
}
