import { redirect } from "next/navigation";

import { SlaAlertFeed } from "@/components/dashboard/sla-alert-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getSlaAlertFeed } from "@/lib/sla/alerts";
import { readSlaConfig } from "@/lib/sla/config";
import { getConnecteamAdminOverview } from "@/lib/connecteam/status";
import { getStatusToneClassName } from "@/lib/sync-status";
import { getZendeskConnectionStatus } from "@/lib/zendesk/status";
import { AgentMappingReview } from "./agent-mapping-review";

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
  if (
    status === "active" ||
    status === "succeeded" ||
    status === "completed" ||
    status === "idle" ||
    status === "auto" ||
    status === "mapped"
  ) {
    return "bg-emerald-100 text-emerald-900";
  }

  if (status === "running" || status === "pending" || status === "partial" || status === "manual") {
    return "bg-amber-100 text-amber-900";
  }

  if (status === "ignored") {
    return "bg-slate-200 text-slate-900";
  }

  return "bg-rose-100 text-rose-900";
}

function syncAlertClassName(hasUsableData: boolean) {
  return hasUsableData
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-rose-200 bg-rose-50 text-rose-900";
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
          Zendesk sync state and the shared Connecteam scheduled-shift sync now share durable run history,
          scheduler assignments, watermarks, and admin review controls.
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
                <Badge className={getStatusToneClassName(connection.syncTrust.health.tone)}>
                  {connection.syncTrust.health.label}
                </Badge>
                <Badge className={getStatusToneClassName(connection.syncTrust.current.tone)}>
                  {connection.syncTrust.current.label}
                </Badge>
                <Badge className={getStatusToneClassName(connection.syncTrust.freshness.tone)}>
                  {connection.syncTrust.freshness.label}
                </Badge>
              </div>
              <CardDescription>{connection.subdomain}.zendesk.com</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-primary/10 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Data trust</p>
                <p>{connection.syncTrust.summary}</p>
                <p className="text-xs">Freshness comes from the oldest incremental watermark.</p>
              </div>

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
                  <p className="font-medium text-foreground">Health</p>
                  <p>{connection.syncTrust.health.label}</p>
                  <p className="text-xs">Current state {connection.syncTrust.current.label}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Last good sync</p>
                  <p>{formatDateTime(connection.syncTrust.latestSuccessAt)}</p>
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

              <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="font-medium text-foreground">Freshness</p>
                  <p>{connection.syncTrust.freshness.label}</p>
                  <p className="text-xs">
                    {connection.syncTrust.freshness.sourceLabel} {formatDateTime(connection.syncTrust.freshness.at)}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Latest failure</p>
                  <p>{formatDateTime(connection.syncTrust.latestFailureAt)}</p>
                  <p className="text-xs">
                    {connection.syncTrust.latestFailureAt
                      ? connection.syncTrust.failureNeedsAttention
                        ? "Newer than the last success"
                        : "Historical only"
                      : "No failed run recorded"}
                  </p>
                </div>
              </div>

              {connection.syncTrust.failureNeedsAttention && connection.syncTrust.latestFailureMessage ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${syncAlertClassName(connection.syncTrust.hasUsableData)}`}>
                  {connection.syncTrust.latestFailureMessage}
                </div>
              ) : null}

              {connection.backfill?.last_error ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {connection.backfill.last_error}
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
                <Badge className={getStatusToneClassName(connection.syncTrust.health.tone)}>
                  {connection.syncTrust.health.label}
                </Badge>
                <Badge className={getStatusToneClassName(connection.syncTrust.current.tone)}>
                  {connection.syncTrust.current.label}
                </Badge>
                <Badge className={getStatusToneClassName(connection.syncTrust.freshness.tone)}>
                  {connection.syncTrust.freshness.label}
                </Badge>
              </div>
                <CardDescription>
                  {connection.connection_scope === "shared" ? "Shared workspace account" : connection.client?.name ?? "Unknown client"} · Connecteam scheduler shifts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-2xl border border-primary/10 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Data trust</p>
                  <p>{connection.syncTrust.summary}</p>
                  <p className="text-xs">Freshness tracks the latest successful user sync.</p>
                </div>

                <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="font-medium text-foreground">Health</p>
                    <p>{connection.syncTrust.health.label}</p>
                    <p className="text-xs">Current state {connection.syncTrust.current.label}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Last good sync</p>
                    <p>{formatDateTime(connection.syncTrust.latestSuccessAt)}</p>
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
                    <p className="font-medium text-foreground">Freshness</p>
                    <p>{connection.syncTrust.freshness.label}</p>
                    <p className="text-xs">
                      {connection.syncTrust.freshness.sourceLabel} {formatDateTime(connection.syncTrust.freshness.at)}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Latest failure</p>
                    <p>{formatDateTime(connection.syncTrust.latestFailureAt)}</p>
                    <p className="text-xs">
                      {connection.syncTrust.latestFailureAt
                        ? connection.syncTrust.failureNeedsAttention
                          ? "Newer than the last success"
                          : "Historical only"
                        : "No failed run recorded"}
                    </p>
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
                    <p>Needs action {connection.mappingReviewSummary.needsAction}</p>
                    <p className="text-xs">Ignored {connection.mappingReviewSummary.ignored}</p>
                    <p className="text-xs">Mapped {connection.mappingReviewSummary.mapped}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Scheduler assignments</p>
                    <p>{connection.schedulerAssignments.length}</p>
                    <p className="text-xs">{connection.schedulers.length} schedulers discovered</p>
                  </div>
                </div>

                {connection.syncTrust.failureNeedsAttention && connection.syncTrust.latestFailureMessage ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${syncAlertClassName(connection.syncTrust.hasUsableData)}`}>
                    {connection.syncTrust.latestFailureMessage}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <form action="/api/admin/connecteam-sync" method="post">
                    <input type="hidden" name="action" value="run_incremental" />
                    <input type="hidden" name="connection_id" value={connection.id} />
                    <Button type="submit">Run scheduler sync</Button>
                  </form>
                </div>

                <AgentMappingReview connection={connection} />
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
