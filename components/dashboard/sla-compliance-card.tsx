import { type SlaMetricCompliance } from "@/lib/metrics/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return `${value.toFixed(1)}%`;
}

function toneClasses(status: SlaMetricCompliance["status"]) {
  switch (status) {
    case "breach":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "inactive":
      return "border-border bg-muted/40 text-muted-foreground";
    case "unconfigured":
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function badgeLabel(status: SlaMetricCompliance["status"]) {
  switch (status) {
    case "breach":
      return "Below threshold";
    case "warning":
      return "Watch";
    case "healthy":
      return "Healthy";
    case "inactive":
      return "No data";
    case "unconfigured":
    default:
      return "Unconfigured";
  }
}

export function SlaComplianceCard({
  title,
  description,
  metric,
  targetLabel = null
}: {
  title: string;
  description: string;
  metric: SlaMetricCompliance;
  targetLabel?: string | null;
}) {
  return (
    <Card className={metric.status === "breach" ? "border-rose-200" : metric.status === "warning" ? "border-amber-200" : ""}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription>{title}</CardDescription>
            <CardTitle>{description}</CardTitle>
          </div>
          <Badge className={toneClasses(metric.status)}>{badgeLabel(metric.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-2xl border p-4 ${toneClasses(metric.status)}`}>
          <p className="text-xs uppercase tracking-[0.18em]">Compliance</p>
          <p className="mt-2 text-2xl font-semibold">{formatPercent(metric.complianceRate)}</p>
        </div>
        <div className="rounded-2xl bg-muted/40 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Target</p>
          <p className="mt-2 text-xl font-semibold">
            {targetLabel ?? (metric.targetMinutes === null ? "Client-specific" : `${metric.targetMinutes}m`)}
          </p>
        </div>
        <div className="rounded-2xl bg-muted/40 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Threshold</p>
          <p className="mt-2 text-xl font-semibold">{formatPercent(metric.thresholdPercent)}</p>
        </div>
        <div className="rounded-2xl bg-muted/40 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tickets</p>
          <p className="mt-2 text-xl font-semibold">
            {metric.compliantCount}/{metric.measuredCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{metric.breachCount} breached</p>
        </div>
      </CardContent>
    </Card>
  );
}
