import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getZendeskConnectionStatus } from "@/lib/zendesk/status";

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

export default async function AdminPage({
  searchParams
}: {
  searchParams?: {
    sync?: string;
  };
}) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  if (context.role !== "admin") {
    redirect("/dashboard");
  }

  const connections = await getZendeskConnectionStatus();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Admin controls</h1>
        <p className="text-sm text-muted-foreground">
          Zendesk sync is now driven from durable connection state, run records, and resumable backfill
          cursors.
        </p>
      </div>

      {searchParams?.sync ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Last admin action: <span className="font-medium text-foreground">{searchParams.sync}</span>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4">
        {connections.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Zendesk connections available</CardTitle>
              <CardDescription>
                Provision rows in `app.zendesk_connections` with credentials before running syncs.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {connections.map((connection) => (
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
                  <p className="text-xs">
                    Updated {formatDateTime(connection.backfill?.updated_at ?? null)}
                  </p>
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
    </div>
  );
}
