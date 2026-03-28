import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Point = {
  date: string;
  primary: number | null;
  secondary: number | null;
};

function buildPath(values: number[], height: number, width: number) {
  if (values.length === 0) {
    return "";
  }

  const maxValue = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function LineChartCard({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  primaryColor,
  secondaryColor,
  data
}: {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryColor: string;
  secondaryColor: string;
  data: Point[];
}) {
  const width = 640;
  const height = 220;
  const primaryValues = data.map((point) => point.primary ?? 0);
  const secondaryValues = data.map((point) => point.secondary ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No daily data landed in the selected window yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                {primaryLabel}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: secondaryColor }} />
                {secondaryLabel}
              </span>
            </div>
            <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height + 24}`} role="img">
              <path
                d={buildPath(primaryValues, height, width)}
                fill="none"
                stroke={primaryColor}
                strokeLinecap="round"
                strokeWidth="4"
              />
              <path
                d={buildPath(secondaryValues, height, width)}
                fill="none"
                stroke={secondaryColor}
                strokeDasharray="8 8"
                strokeLinecap="round"
                strokeWidth="4"
              />
            </svg>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
              {data.slice(Math.max(0, data.length - 4)).map((point) => (
                <div key={point.date} className="rounded-2xl bg-muted/60 p-3">
                  <p>
                    {new Intl.DateTimeFormat("en-GB", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC"
                    }).format(new Date(`${point.date}T00:00:00.000Z`))}
                  </p>
                  <p className="mt-1 font-medium text-foreground">
                    {point.primary !== null ? point.primary.toFixed(1) : "0.0"} /{" "}
                    {point.secondary !== null ? point.secondary.toFixed(1) : "0.0"}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
