import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUserContext } from "@/lib/auth/session";
import { readSlaConfig } from "@/lib/sla/config";
import { getConnecteamConnectionStatus } from "@/lib/connecteam/status";
import { getStatusToneClassName } from "@/lib/sync-status";
import { getVisibleClients, getZendeskConnectionStatus } from "@/lib/zendesk/status";
import {
  createClientAction,
  createConnecteamConnectionAction,
  createZendeskConnectionAction,
  disconnectConnecteamConnectionAction,
  disconnectZendeskConnectionAction,
  reauthZendeskConnectionAction,
  saveZendeskConnecteamScheduleAction,
  saveZendeskSlaConfigAction,
  testConnecteamConnectionAction,
  testZendeskConnectionAction
} from "./actions";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

function badgeClassName(status: string) {
  if (status === "active" || status === "succeeded" || status === "completed" || status === "idle") {
    return "bg-emerald-100 text-emerald-900";
  }

  if (status === "running" || status === "pending" || status === "partial") {
    return "bg-amber-100 text-amber-900";
  }

  return "bg-rose-100 text-rose-900";
}

function syncAlertClassName(hasUsableData: boolean) {
  return hasUsableData
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-rose-200 bg-rose-50 text-rose-900";
}

function formatConnectionMessage(status: string | undefined, detail: string | undefined) {
  type FlashMessage = {
    tone: "success" | "error" | "neutral";
    message: string;
  };

  if (!status) {
    return null;
  }

  const suffix = detail ? ` (${detail})` : "";

  switch (status) {
    case "connected":
      return { tone: "success", message: `Zendesk OAuth completed successfully${suffix}.` } satisfies FlashMessage;
    case "connected-sync-started":
      return {
        tone: "success",
        message: `Zendesk OAuth completed and the initial sync was started${suffix}.`
      } satisfies FlashMessage;
    case "connected-sync-failed":
      return {
        tone: "error",
        message: `Zendesk OAuth completed but the initial sync could not be started${suffix}.`
      } satisfies FlashMessage;
    case "tested":
      return { tone: "success", message: `Zendesk connection test passed${suffix}.` } satisfies FlashMessage;
    case "disconnected":
      return { tone: "neutral", message: `Zendesk connection disconnected${suffix}.` } satisfies FlashMessage;
    case "connecteam-connected":
      return { tone: "success", message: `Connecteam API key validated successfully${suffix}.` } satisfies FlashMessage;
    case "connecteam-connected-sync-started":
      return {
        tone: "success",
        message: `Connecteam API key validated and the initial sync was started${suffix}.`
      } satisfies FlashMessage;
    case "connecteam-connected-sync-failed":
      return {
        tone: "error",
        message: `Connecteam API key validated but the initial sync could not be started${suffix}.`
      } satisfies FlashMessage;
    case "connecteam-schedule-saved":
      return { tone: "success", message: `Connecteam scheduler assignment saved${suffix}.` } satisfies FlashMessage;
    case "connecteam-tested":
      return { tone: "success", message: `Connecteam connection test passed${suffix}.` } satisfies FlashMessage;
    case "connecteam-disconnected":
      return { tone: "neutral", message: `Connecteam connection disconnected${suffix}.` } satisfies FlashMessage;
    case "connecteam-missing-api-key":
      return { tone: "error", message: "Connecteam API key is required." } satisfies FlashMessage;
    case "connecteam-save-failed":
      return { tone: "error", message: `Connecteam connection could not be saved${suffix}.` } satisfies FlashMessage;
    case "connecteam-test-failed":
      return { tone: "error", message: `Connecteam validation failed${suffix}.` } satisfies FlashMessage;
    case "connecteam-schedule-save-failed":
      return { tone: "error", message: `Connecteam scheduler assignment failed${suffix}.` } satisfies FlashMessage;
    case "oauth-denied":
      return { tone: "error", message: `Zendesk authorization was denied${suffix}.` } satisfies FlashMessage;
    case "oauth-failed":
      return { tone: "error", message: `Zendesk OAuth failed${suffix}.` } satisfies FlashMessage;
    case "oauth-client-config-invalid":
      return {
        tone: "error",
        message: "Zendesk OAuth client ID and secret must both be set when using a per-connection client."
      } satisfies FlashMessage;
    case "test-failed":
      return { tone: "error", message: `Zendesk connection test failed${suffix}.` } satisfies FlashMessage;
    case "sla-saved":
      return { tone: "success", message: "SLA settings saved successfully." } satisfies FlashMessage;
    case "sla-invalid":
      return { tone: "error", message: "SLA settings must use positive minute targets and a 0-100 threshold." } satisfies FlashMessage;
    case "sla-save-failed":
      return { tone: "error", message: `SLA settings could not be saved${suffix}.` } satisfies FlashMessage;
    default:
      return { tone: "error", message: `Connection action returned: ${status}${suffix}.` } satisfies FlashMessage;
  }
}

function alertClassName(tone: "success" | "error" | "neutral") {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (tone === "neutral") {
    return "border-border bg-muted/40 text-foreground";
  }

  return "border-rose-200 bg-rose-50 text-rose-900";
}

export default async function ConnectionsPage({
  searchParams
}: {
  searchParams?: {
    connection?: string;
    detail?: string;
  };
}) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  if (context.role !== "admin") {
    redirect("/dashboard");
  }

  const [zendeskConnections, connecteamConnections, clients] = await Promise.all([
    getZendeskConnectionStatus(),
    getConnecteamConnectionStatus(),
    getVisibleClients()
  ]);
  const flash = formatConnectionMessage(searchParams?.connection, searchParams?.detail);
  const isAdmin = context.role === "admin";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Create, validate, re-authorize, and disconnect Zendesk plus a shared Connecteam account, then assign one
          Connecteam scheduler to each Zendesk connection and store per-client SLA targets.
        </p>
      </div>

      {flash ? (
        <Card className={alertClassName(flash.tone)}>
          <CardContent className="pt-5 text-sm">{flash.message}</CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Create client</CardTitle>
            <CardDescription>
              Add a new client record. Each client maps to one Zendesk instance and one set of Connecteam agents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createClientAction} className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="client-name">Client name</Label>
                <Input id="client-name" name="name" placeholder="e.g. IT Jones" required />
              </div>
              <Button type="submit">Create client</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add Connecteam connection</CardTitle>
          <CardDescription>
            Store one shared Connecteam API key for the workspace. After validation and sync, assign a scheduler to
            each Zendesk connection below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createConnecteamConnectionAction} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="connecteamName">Connection label</Label>
                <Input id="connecteamName" name="name" placeholder="Shared Connecteam account" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiKey">API key</Label>
                <Input id="apiKey" name="apiKey" placeholder="Paste Connecteam API key" required type="password" />
              </div>
              <div className="md:col-span-2">
                <Button type="submit">Save and validate Connecteam</Button>
              </div>
            </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Zendesk connection</CardTitle>
          <CardDescription>
            Choose the client row and Zendesk subdomain. Leave OAuth client fields blank only if this app&apos;s
            shared environment credentials are a real Zendesk global OAuth client. Otherwise, enter the customer
            account&apos;s own OAuth client ID and secret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No app clients exist yet. Create a client record before adding a Zendesk connection.
            </p>
          ) : (
            <form action={createZendeskConnectionAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="clientId">Client</Label>
                <select
                  className="flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  defaultValue=""
                  id="clientId"
                  name="clientId"
                  required
                >
                  <option disabled value="">
                    Select a client
                  </option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Connection label</Label>
                <Input id="name" name="name" placeholder="Acme Support" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subdomain">Zendesk subdomain</Label>
                <Input id="subdomain" name="subdomain" placeholder="acme" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oauthClientId">OAuth client ID</Label>
                <Input id="oauthClientId" name="oauthClientId" placeholder="Leave blank to use shared env client" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oauthClientSecret">OAuth client secret</Label>
                <Input
                  id="oauthClientSecret"
                  name="oauthClientSecret"
                  placeholder="Required with per-connection client ID"
                  type="password"
                />
              </div>
              <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Zendesk local OAuth clients are account-specific. For arbitrary external customer instances, either
                use a Zendesk global OAuth client or have each customer create a confidential OAuth client in their
                own Zendesk Admin Center and provide its ID and secret here.
              </div>
              <div className="md:col-span-3">
                <Button type="submit">Start Zendesk OAuth</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4">
        {connecteamConnections.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No visible Connecteam connections</CardTitle>
              <CardDescription>
                Create a Connecteam connection above to store an API key and validate account access.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {connecteamConnections.map((connection) => {
          const account = ((connection.metadata as { account?: unknown } | null)?.account as
            | { name?: string | null; email?: string | null; timezone?: string | null; country?: string | null }
            | undefined) ?? {};

          return (
            <Card key={connection.id}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{connection.name}</CardTitle>
                  <Badge className={badgeClassName(connection.status)}>{connection.status}</Badge>
                  <Badge className={getStatusToneClassName(connection.syncTrust.health.tone)}>
                    {connection.syncTrust.health.label}
                  </Badge>
                  <Badge className={getStatusToneClassName(connection.syncTrust.current.tone)}>
                    {connection.syncTrust.current.label}
                  </Badge>
                  <Badge className={getStatusToneClassName(connection.syncTrust.freshness.tone)}>
                    {connection.syncTrust.freshness.label}
                  </Badge>
                  {connection.last_validation_status ? (
                    <Badge className={badgeClassName(connection.last_validation_status)}>
                      {connection.last_validation_status}
                    </Badge>
                  ) : null}
                </div>
                <CardDescription>
                  {connection.connection_scope === "shared" ? "Shared workspace account" : connection.client?.name ?? "Unknown client"} · Connecteam
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-2xl border border-primary/10 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Data trust</p>
                  <p>{connection.syncTrust.summary}</p>
                </div>

                <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-medium text-foreground">Credential</p>
                    <p>API key</p>
                    <p className="text-xs">Stored server-side only</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Validation</p>
                    <p>{formatDateTime(connection.last_validated_at)}</p>
                    <p className="text-xs">{connection.last_validation_status ?? "Not validated yet"}</p>
                    <p className="text-xs">Account {connection.external_account_id ?? "n/a"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Account</p>
                    <p>{account.name ?? "Unknown account"}</p>
                    <p className="text-xs">{account.email ?? "No email returned"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Client</p>
                    <p>{connection.connection_scope === "shared" ? "Shared across Zendesk clients" : connection.client?.name ?? "Unknown client"}</p>
                    <p className="text-xs">Scope {connection.connection_scope}</p>
                  </div>
                </div>

                <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-medium text-foreground">Current sync state</p>
                    <p>{connection.syncTrust.current.label}</p>
                    <p className="text-xs">Started {formatDateTime(connection.last_sync_started_at)}</p>
                    <p className="text-xs">Completed {formatDateTime(connection.last_sync_completed_at)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Last good sync</p>
                    <p>{formatDateTime(connection.syncTrust.latestSuccessAt)}</p>
                    <p className="text-xs">Freshness {connection.syncTrust.freshness.label}</p>
                    <p className="text-xs">Scheduler shifts remain the source of staffing coverage</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Latest failure</p>
                    <p>{formatDateTime(connection.syncTrust.latestFailureAt)}</p>
                    <p className="text-xs">
                      {connection.syncTrust.latestFailureAt
                        ? connection.syncTrust.failureNeedsAttention
                          ? "Still needs attention"
                          : "Historical only"
                        : "No failed run recorded"}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Timezone</p>
                    <p>{account.timezone ?? "n/a"}</p>
                    <p className="text-xs">Country {account.country ?? "n/a"}</p>
                  </div>
                </div>

                {connection.last_validation_error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    {connection.last_validation_error}
                  </div>
                ) : null}

                {connection.syncTrust.failureNeedsAttention && connection.syncTrust.latestFailureMessage ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${syncAlertClassName(connection.syncTrust.hasUsableData)}`}>
                    {connection.syncTrust.latestFailureMessage}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <form action={testConnecteamConnectionAction}>
                    <input name="connectionId" type="hidden" value={connection.id} />
                    <Button type="submit">Test connection</Button>
                  </form>
                  <form action={disconnectConnecteamConnectionAction}>
                    <input name="connectionId" type="hidden" value={connection.id} />
                    <Button type="submit" variant="outline">
                      Disconnect
                    </Button>
                  </form>
                </div>

                <div className="space-y-4 rounded-[24px] border border-border bg-muted/20 p-5">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">Zendesk scheduler assignments</h3>
                    <p className="text-sm text-muted-foreground">
                      Each Zendesk connection selects one Connecteam scheduler from this shared account.
                    </p>
                  </div>

                  {zendeskConnections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Create a Zendesk connection before assigning schedulers.</p>
                  ) : null}

                  <div className="space-y-3">
                    {zendeskConnections.map((zendeskConnection) => {
                      const assignment = connection.schedulerAssignments.find(
                        (row) => row.zendesk_connection_id === zendeskConnection.id
                      );

                      return (
                        <form
                          action={saveZendeskConnecteamScheduleAction}
                          className="grid gap-3 rounded-2xl border border-border bg-background px-4 py-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]"
                          key={`${connection.id}:${zendeskConnection.id}`}
                        >
                          <input type="hidden" name="clientId" value={zendeskConnection.client_id} />
                          <input type="hidden" name="zendeskConnectionId" value={zendeskConnection.id} />
                          <input type="hidden" name="connecteamConnectionId" value={connection.id} />

                          <div className="space-y-1 text-sm">
                            <p className="font-medium text-foreground">{zendeskConnection.name}</p>
                            <p className="text-muted-foreground">
                              {zendeskConnection.client?.name ?? "Unknown client"} · {zendeskConnection.subdomain}.zendesk.com
                            </p>
                          </div>

                          <div className="space-y-2">
                            <select
                              className="flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                              defaultValue={assignment?.scheduler_id ?? ""}
                              name="schedulerId"
                            >
                              <option value="">No scheduler selected</option>
                              {connection.schedulers.map((scheduler) => (
                                <option key={scheduler.scheduler_id} value={scheduler.scheduler_id}>
                                  {scheduler.scheduler_name ?? scheduler.scheduler_id}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-3">
                            <Badge className={badgeClassName(assignment ? "active" : "pending")}>
                              {assignment?.scheduler_name ?? "unassigned"}
                            </Badge>
                            <Button type="submit" variant="outline">
                              Save schedule
                            </Button>
                          </div>
                        </form>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {zendeskConnections.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No visible Zendesk connections</CardTitle>
              <CardDescription>
                Create a Zendesk connection above to start the OAuth flow and unlock sync operations.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {zendeskConnections.map((connection) => (
          <Card key={connection.id}>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{connection.name}</CardTitle>
                <Badge className={badgeClassName(connection.status)}>{connection.status}</Badge>
                <Badge className={getStatusToneClassName(connection.syncTrust.health.tone)}>
                  {connection.syncTrust.health.label}
                </Badge>
                <Badge className={getStatusToneClassName(connection.syncTrust.current.tone)}>
                  {connection.syncTrust.current.label}
                </Badge>
                <Badge className={getStatusToneClassName(connection.syncTrust.freshness.tone)}>
                  {connection.syncTrust.freshness.label}
                </Badge>
                {connection.last_validation_status ? (
                  <Badge className={badgeClassName(connection.last_validation_status)}>
                    {connection.last_validation_status}
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                {connection.client?.name ?? "Unknown client"} · {connection.subdomain}.zendesk.com
              </CardDescription>
            </CardHeader>
              <CardContent className="space-y-6">
              {(() => {
                const sla = readSlaConfig(connection.metadata);

                return (
                  <div className="rounded-[24px] border border-primary/10 bg-muted/20 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-foreground">Client SLA settings</h3>
                        <p className="text-sm text-muted-foreground">
                          These targets drive dashboard compliance cards and admin alerts for this client.
                        </p>
                      </div>
                      <Badge className={badgeClassName(sla?.alertsEnabled ? "active" : "disconnected")}>
                        {sla?.alertsEnabled ? "alerts enabled" : "alerts disabled"}
                      </Badge>
                    </div>

                    <form action={saveZendeskSlaConfigAction} className="mt-5 grid gap-4 lg:grid-cols-4">
                      <input name="connectionId" type="hidden" value={connection.id} />
                      <div className="space-y-2">
                        <Label htmlFor={`sla-first-reply-${connection.id}`}>First reply target (minutes)</Label>
                        <Input
                          defaultValue={sla?.firstReplyTargetMinutes ?? 60}
                          id={`sla-first-reply-${connection.id}`}
                          min={1}
                          name="firstReplyTargetMinutes"
                          required
                          type="number"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`sla-resolution-${connection.id}`}>Full resolution target (minutes)</Label>
                        <Input
                          defaultValue={sla?.fullResolutionTargetMinutes ?? 480}
                          id={`sla-resolution-${connection.id}`}
                          min={1}
                          name="fullResolutionTargetMinutes"
                          required
                          type="number"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`sla-threshold-${connection.id}`}>Alert threshold (%)</Label>
                        <Input
                          defaultValue={sla?.alertThresholdPercent ?? 90}
                          id={`sla-threshold-${connection.id}`}
                          max={100}
                          min={0}
                          name="alertThresholdPercent"
                          required
                          step="0.1"
                          type="number"
                        />
                      </div>
                      <div className="flex flex-col justify-between rounded-2xl border border-border bg-background px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Alerting</p>
                          <p className="text-xs text-muted-foreground">In-app alerts always dedupe on a cooldown.</p>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                          <input defaultChecked={sla?.alertsEnabled ?? true} name="alertsEnabled" type="checkbox" />
                          Enable breach alerts
                        </label>
                      </div>
                      <div className="lg:col-span-4 flex flex-wrap items-center gap-3">
                        <Button type="submit">Save SLA settings</Button>
                        <p className="text-xs text-muted-foreground">
                          Default cooldown is 6 hours for repeated alerts on the same breach state.
                        </p>
                      </div>
                    </form>
                  </div>
                );
              })()}

              <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="font-medium text-foreground">OAuth credentials</p>
                  <p>{connection.credential_type === "oauth_token" ? "OAuth token" : "API token"}</p>
                  <p className="text-xs">Token type {connection.token_type ?? "n/a"}</p>
                  <p className="text-xs">Access expiry {formatDateTime(connection.token_expires_at)}</p>
                  <p className="text-xs">Refresh expiry {formatDateTime(connection.refresh_token_expires_at)}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">OAuth client source</p>
                  <p>
                    {String(
                      (
                        (
                          connection.metadata?.oauth as
                            | { client_source?: string | null }
                            | undefined
                        )?.client_source ?? "unknown"
                      )
                    )}
                  </p>
                  <p className="text-xs">Per-connection client ID overrides shared environment credentials</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Validation</p>
                  <p>{formatDateTime(connection.last_validated_at)}</p>
                  <p className="text-xs">{connection.last_validation_status ?? "Not validated yet"}</p>
                  <p className="text-xs">Account {connection.external_account_id ?? "n/a"}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">OAuth account</p>
                  <p>
                    {String(
                      (
                        (
                          connection.metadata?.oauth as
                            | { user?: { name?: string | null; email?: string | null } }
                            | undefined
                        )?.user?.name ?? "Unknown user"
                      )
                    )}
                  </p>
                  <p className="text-xs">
                    {String(
                      (
                        (
                          connection.metadata?.oauth as
                            | { user?: { email?: string | null } }
                            | undefined
                        )?.user?.email ?? "No email returned"
                      )
                    )}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Client</p>
                  <p>{connection.client?.name ?? "Unknown client"}</p>
                  <p className="text-xs">Slug {connection.client?.slug ?? "n/a"}</p>
                </div>
              </div>

              <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="font-medium text-foreground">Last sync</p>
                  <p>{formatDateTime(connection.syncTrust.latestSuccessAt)}</p>
                  <p className="text-xs">Completed {formatDateTime(connection.last_sync_completed_at)}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Latest run</p>
                  <p>
                    {connection.latestRun
                      ? `${connection.latestRun.sync_mode} via ${connection.latestRun.trigger_source}`
                      : "No runs recorded"}
                  </p>
                  <p className="text-xs">
                    {connection.latestRun?.status ?? "n/a"} ·{" "}
                    {formatDateTime(connection.latestRun?.completed_at ?? null)}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Backfill</p>
                  <p>
                    {connection.backfill
                      ? `${connection.backfill.status} · ${connection.backfill.phase}`
                      : "Not queued"}
                  </p>
                  <p className="text-xs">
                    Tickets {connection.backfill?.progress?.tickets ?? 0} · Metrics{" "}
                    {connection.backfill?.progress?.ticket_metrics ?? 0} · Agents{" "}
                    {connection.backfill?.progress?.agents ?? 0}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Watermarks</p>
                  <p>Tickets {formatDateTime(connection.tickets_synced_through)}</p>
                  <p className="text-xs">Metrics {formatDateTime(connection.ticket_metrics_synced_through)}</p>
                  <p className="text-xs">Agents {formatDateTime(connection.agents_synced_through)}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-primary/10 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Data trust</p>
                <p>{connection.syncTrust.summary}</p>
                <p className="text-xs">
                  Freshness comes from the oldest incremental watermark, not just the latest run result.
                </p>
              </div>

              <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="font-medium text-foreground">Health</p>
                  <p>{connection.syncTrust.health.label}</p>
                  <p className="text-xs">Current state {connection.syncTrust.current.label}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Freshness</p>
                  <p>{connection.syncTrust.freshness.label}</p>
                  <p className="text-xs">
                    {connection.syncTrust.freshness.sourceLabel} {formatDateTime(connection.syncTrust.freshness.at)}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Last good sync</p>
                  <p>{formatDateTime(connection.syncTrust.latestSuccessAt)}</p>
                  <p className="text-xs">`last_synced_at` should only move on non-failed runs</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Latest failure</p>
                  <p>{formatDateTime(connection.syncTrust.latestFailureAt)}</p>
                  <p className="text-xs">
                    {connection.syncTrust.latestFailureAt
                      ? connection.syncTrust.failureNeedsAttention
                        ? "Newer than the last success"
                        : "Older than the last success"
                      : "No failed run recorded"}
                  </p>
                </div>
              </div>

              {connection.last_validation_error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {connection.last_validation_error}
                </div>
              ) : null}

              {connection.syncTrust.failureNeedsAttention && connection.syncTrust.latestFailureMessage ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${syncAlertClassName(connection.syncTrust.hasUsableData)}`}>
                  {connection.syncTrust.latestFailureMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <form action={testZendeskConnectionAction}>
                  <input name="connectionId" type="hidden" value={connection.id} />
                  <Button type="submit">Test connection</Button>
                </form>
                <form action={reauthZendeskConnectionAction}>
                  <input name="connectionId" type="hidden" value={connection.id} />
                  <Button type="submit" variant="outline">
                    Re-auth
                  </Button>
                </form>
                <form action={disconnectZendeskConnectionAction}>
                  <input name="connectionId" type="hidden" value={connection.id} />
                  <Button type="submit" variant="outline">
                    Disconnect
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
