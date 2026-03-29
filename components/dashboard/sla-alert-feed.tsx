import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type SlaAlertFeedItem } from "@/lib/sla/alerts";

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

function statusClassName(status: SlaAlertFeedItem["status"]) {
  return status === "active" ? "bg-rose-100 text-rose-900" : "bg-muted text-muted-foreground";
}

export function SlaAlertFeed({
  alerts,
  description = "Recent SLA events."
}: {
  alerts: SlaAlertFeedItem[];
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>SLA alerts</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            No SLA alerts have been recorded yet.
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              className={`rounded-2xl border px-4 py-4 text-sm ${
                alert.status === "active"
                  ? "border-rose-200 bg-rose-50 text-rose-950"
                  : "border-border bg-muted/20 text-muted-foreground"
              }`}
              key={alert.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{alert.title}</p>
                  <p className="mt-1">{alert.message}</p>
                </div>
                <Badge className={statusClassName(alert.status)}>{alert.status}</Badge>
              </div>
              <p className="mt-2 text-xs">
                {alert.windowStart} to {alert.windowEnd} · Notified {formatDateTime(alert.lastNotifiedAt)} · Evaluated{" "}
                {formatDateTime(alert.lastEvaluatedAt)}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
