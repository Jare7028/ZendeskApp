import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default async function ConnectionsPage() {
  const connections = await getZendeskConnectionStatus();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Zendesk connections now surface persisted sync state, latest run outcomes, and historical backfill
          progress for each client-visible tenant.
        </p>
      </div>

      <section className="grid gap-4">
        {connections.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No visible Zendesk connections</CardTitle>
              <CardDescription>
                Connection records must exist in `app.zendesk_connections` before the sync engine can run.
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
              </div>
              <CardDescription>{connection.subdomain}.zendesk.com</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="font-medium text-foreground">Last sync</p>
                <p>{formatDateTime(connection.last_synced_at)}</p>
                <p className="text-xs">Started {formatDateTime(connection.last_sync_started_at)}</p>
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
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
