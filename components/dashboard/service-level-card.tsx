import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  if (value >= 60) {
    return `${(value / 60).toFixed(1)}h`;
  }

  return `${value.toFixed(1)}m`;
}

export function ServiceLevelCard({
  title,
  description,
  average,
  median,
  p90
}: {
  title: string;
  description: string;
  average: number | null;
  median: number | null;
  p90: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle>{description}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Average</p>
          <p className="mt-2 text-xl font-semibold">{formatMinutes(average)}</p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Median</p>
          <p className="mt-2 text-xl font-semibold">{formatMinutes(median)}</p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">P90</p>
          <p className="mt-2 text-xl font-semibold">{formatMinutes(p90)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
