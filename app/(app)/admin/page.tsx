import { redirect } from "next/navigation";

import { SlaAlertFeed } from "@/components/dashboard/sla-alert-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getSlaAlertFeed } from "@/lib/sla/alerts";
import { readSlaConfig } from "@/lib/sla/config";
import { getConnecteamAdminOverview } from "@/lib/connecteam/status";
import { getZendeskConnectionStatus } from "@/lib/zendesk/status";
import { saveAgentMappingOverrideAction } from "./actions";

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
  if (status === "active" || status === "succeeded" || status === "completed" || status === "idle" || status === "auto") {
    return "bg-emerald-100 text-emerald-900";
  }

  if (status === "running" || status === "pending" || status === "partial" || status === "manual") {
    return "bg-amber-100 text-amber-900";
  }

  return "bg-rose-100 text-rose-900";
}

function formatSyncMessage(status: string | undefined, detail: string | undefined) {
  if (!status) {
    return null;
  }

  const suffix = detail ? ` (${detail})` : "";

  switch (status) {
    case "incremental-started":
      return `Zendesk incremental sync started${suffix}.`;
    case "backfill-started":
      return `Zendesk backfill continued${suffix}.`;
    case "backfill-restarted":
      return `Zendesk backfill restarted${suffix}.`;
    case "connecteam-incremental-started":
      return `Connecteam scheduler sync started${suffix}.`;
    case "mapping-saved":
      return `Agent mapping override saved${suffix}.`;
    case "mapping-missing-fields":
      return "Agent mapping override is missing required fields.";
    case "mapping-save-failed":
      return `Agent mapping override failed${suffix}.`;
    case "connecteam-missing-connection":
      return "Connecteam sync requires a connection.";
    default:
      return `Last admin action: ${status}${suffix}.`;
  }
}

export default async function AdminPage({
  searchParams
}: {
  searchParams?: {
    sync?: string;
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

  const [zendeskConnections, connecteamConnections, alerts] = await Promise.all([
    getZendeskConnectionStatus(),
    getConnecteamAdminOverview(),
    getSlaAlertFeed()
  ]);
  const flashMessage = formatSyncMessage(searchParams?.sync, searchParams?.detail);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Admin controls</h1>
        <p className="text-sm text-muted-foreground">
          Zendesk sync state and Connecteam scheduled-shift sync now share durable run history, watermarks, and
          admin review controls.
        </p>
      </div>

      {flashMessage ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">{flashMessage}</CardContent>
        </Card>
      ) : null}

      <SlaAlertFeed
        alerts={alerts}
        description="Deduped SLA breach records for admins. Email delivery is optional and only runs when configured."
      />

      <section className="grid gap-4">
        {zendeskConnections.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Zendesk connections available</CardTitle>
              <CardDescription>
                Provision rows in `app.zendesk_connections` with credentials before running syncs.
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
                <Badge className={badgeClassName(connection.sync_status)}>{connection.sync_status}</Badge>
                {connection.last_sync_status ? (
                  <Badge className={badgeClassName(connection.last_sync_status)}>
                    {connection.last_sync_status}
                  </Badge>
                ) : null}
              </div>
              <CardDescription>{connection.subdomain}.zendesk.com</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {(() => {
                const sla = readSlaConfig(connection.metadata);

                return sla ? (
                  <div className="rounded-2xl border border-primary/10 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">SLA configuration</p>
                    <p>
                      First reply {sla.firstReplyTargetMinutes}m · Full resolution {sla.fullResolutionTargetMinutes}m
                    </p>
                    <p className="text-xs">
                      Alert threshold {sla.alertThresholdPercent.toFixed(1)}% · Alerts {sla.alertsEnabled ? "enabled" : "disabled"} · Cooldown {sla.cooldownMinutes}m
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    No SLA target configured on this connection yet.
                  </div>
                );
              })()}
              <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="font-medium text-foreground">Connection status</p>
                  <p>Last sync {formatDateTime(connection.last_synced_at)}</p>
                  <p className="text-xs">Started {formatDateTime(connection.last_sync_started_at)}</p>
                  <p className="text-xs">Completed {formatDateTime(connection.last_sync_completed_at)}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Latest run</p>
                  <p>
                    {connection.latestRun
                      ? `${connection.latestRun.sync_mode} via ${connection.latestRun.trigger_source}`
                      : "No run yet"}
                  </p>
                  <p className="text-xs">
                    {connection.latestRun?.status ?? "n/a"} ·{" "}
                    {formatDateTime(connection.latestRun?.started_at ?? null)}
                  </p>
                  <p className="text-xs">
                    Tickets {connection.latestRun?.counts?.tickets ?? 0} · Metrics{" "}
                    {connection.latestRun?.counts?.ticket_metrics ?? 0} · Agents{" "}
                    {connection.latestRun?.counts?.agents ?? 0}
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
                  <p className="text-xs">Updated {formatDateTime(connection.backfill?.updated_at ?? null)}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Incremental watermarks</p>
                  <p>Tickets {formatDateTime(connection.tickets_synced_through)}</p>
                  <p className="text-xs">Metrics {formatDateTime(connection.ticket_metrics_synced_through)}</p>
                  <p className="text-xs">Agents {formatDateTime(connection.agents_synced_through)}</p>
                </div>
              </div>

              {connection.last_sync_error || connection.backfill?.last_error || connection.latestRun?.error_message ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {connection.last_sync_error ?? connection.backfill?.last_error ?? connection.latestRun?.error_message}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <form action="/api/admin/zendesk-sync" method="post">
                  <input type="hidden" name="action" value="run_incremental" />
                  <input type="hidden" name="connection_id" value={connection.id} />
                  <Button type="submit">Run incremental sync</Button>
                </form>
                <form action="/api/admin/zendesk-sync" method="post">
                  <input type="hidden" name="action" value="start_backfill" />
                  <input type="hidden" name="connection_id" value={connection.id} />
                  <Button type="submit" variant="outline">
                    Continue backfill
                  </Button>
                </form>
                <form action="/api/admin/zendesk-sync" method="post">
                  <input type="hidden" name="action" value="restart_backfill" />
                  <input type="hidden" name="connection_id" value={connection.id} />
                  <Button type="submit" variant="outline">
                    Restart backfill
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4">
        {connecteamConnections.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Connecteam connections available</CardTitle>
              <CardDescription>Add an active Connecteam connection before syncing scheduler shifts.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {connecteamConnections.map((connection) => {
          const account = ((connection.metadata as { account?: unknown } | null)?.account as
            | { name?: string | null; email?: string | null; timezone?: string | null }
            | undefined) ?? { };

          return (
            <Card key={connection.id}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{connection.name}</CardTitle>
                  <Badge className={badgeClassName(connection.status)}>{connection.status}</Badge>
                  <Badge className={badgeClassName(connection.sync_status)}>{connection.sync_status}</Badge>
                  {connection.last_sync_status ? (
                    <Badge className={badgeClassName(connection.last_sync_status)}>
                      {connection.last_sync_status}
                    </Badge>
                  ) : null}
                </div>
                <CardDescription>{connection.client?.name ?? "Unknown client"} · Connecteam scheduler shifts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-medium text-foreground">Sync</p>
                    <p>Last sync {formatDateTime(connection.last_synced_at)}</p>
                    <p className="text-xs">Started {formatDateTime(connection.last_sync_started_at)}</p>
                    <p className="text-xs">Completed {formatDateTime(connection.last_sync_completed_at)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Latest run</p>
                    <p>
                      {connection.latestRun
                        ? `${connection.latestRun.sync_mode} via ${connection.latestRun.trigger_source}`
                        : "No run yet"}
                    </p>
                    <p className="text-xs">
                      Users {connection.latestRun?.counts?.users ?? 0} · Schedulers{" "}
                      {connection.latestRun?.counts?.schedulers ?? 0}
                    </p>
                    <p className="text-xs">
                      Shift rows {connection.latestRun?.counts?.shifts ?? 0} · Daily schedules{" "}
                      {connection.latestRun?.counts?.scheduled_days ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Persisted data</p>
                    <p>Users {connection.persistedCounts.users}</p>
                    <p className="text-xs">Shift rows {connection.persistedCounts.shifts}</p>
                    <p className="text-xs">Daily schedules {connection.persistedCounts.scheduledDays}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Watermarks</p>
                    <p>Users synced {formatDateTime(connection.users_synced_at)}</p>
                    <p className="text-xs">Shifts through {formatDateTime(connection.shifts_synced_through)}</p>
                    <p className="text-xs">{account.timezone ?? "UTC"} local-day split</p>
                  </div>
                </div>

                <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-medium text-foreground">Account</p>
                    <p>{account.name ?? "Unknown account"}</p>
                    <p className="text-xs">{account.email ?? "No email returned"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Mappings</p>
                    <p>Auto {connection.mappingSummary.auto}</p>
                    <p className="text-xs">Manual {connection.mappingSummary.manual}</p>
                    <p className="text-xs">Unmatched {connection.mappingSummary.unmatched}</p>
                  </div>
                </div>

                {connection.last_sync_error || connection.latestRun?.error_message ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    {connection.last_sync_error ?? connection.latestRun?.error_message}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <form action="/api/admin/connecteam-sync" method="post">
                    <input type="hidden" name="action" value="run_incremental" />
                    <input type="hidden" name="connection_id" value={connection.id} />
                    <Button type="submit">Run scheduler sync</Button>
                  </form>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">Agent identity mapping</h2>
                    <p className="text-sm text-muted-foreground">
                      Auto-match uses Zendesk agent email against Connecteam user email for this client. Manual
                      overrides survive later syncs.
                    </p>
                  </div>

                  {connection.zendeskAgents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                      No Zendesk agents have been synced for this client yet.
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {connection.zendeskAgents.map((agent) => (
                      <form
                        action={saveAgentMappingOverrideAction}
                        className="grid gap-3 rounded-2xl border border-border px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_220px_auto]"
                        key={`${connection.id}:${agent.zendeskConnectionId}:${agent.zendeskAgentId}`}
                      >
                        <input type="hidden" name="clientId" value={connection.client_id} />
                        <input type="hidden" name="zendeskConnectionId" value={agent.zendeskConnectionId} />
                        <input type="hidden" name="connecteamConnectionId" value={connection.id} />
                        <input type="hidden" name="zendeskAgentId" value={agent.zendeskAgentId} />

                        <div className="space-y-1 text-sm">
                          <p className="font-medium text-foreground">{agent.zendeskName ?? agent.email ?? agent.zendeskAgentId}</p>
                          <p className="text-muted-foreground">{agent.email ?? "No email on Zendesk agent"}</p>
                        </div>

                        <div className="space-y-1 text-sm">
                          <p className="font-medium text-foreground">
                            {agent.mapping?.connecteam_user_name ?? "No Connecteam user selected"}
                          </p>
                          <p className="text-muted-foreground">
                            {agent.mapping?.connecteam_user_id ?? "No current Connecteam mapping"}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <select
                            className="flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                            defaultValue={agent.mapping?.connecteam_user_id ?? ""}
                            name="connecteamUserId"
                          >
                            <option value="">No match / clear</option>
                            {connection.users.map((user) => (
                              <option key={user.connecteam_user_id} value={user.connecteam_user_id}>
                                {user.full_name ?? user.email ?? user.connecteam_user_id}
                                {user.email ? ` (${user.email})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-3">
                          <Badge className={badgeClassName(agent.mapping?.match_source ?? "unmatched")}>
                            {agent.mapping?.match_source ?? "unmatched"}
                          </Badge>
                          <Button type="submit" variant="outline">
                            Save override
                          </Button>
                        </div>
                      </form>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
