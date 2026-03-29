import { buildHref } from "@/components/dashboard/dashboard-query";
import { type TrendGranularity } from "@/lib/metrics/dashboard";
import { cn } from "@/lib/utils";

const OPTIONS: TrendGranularity[] = ["daily", "weekly", "monthly"];

export function GranularityToggle({
  pathname,
  params,
  granularity
}: {
  pathname: string;
  params: Record<string, string>;
  granularity: TrendGranularity;
}) {
  return (
    <div className="inline-flex rounded-2xl border bg-background p-1">
      {OPTIONS.map((option) => (
        <a
          key={option}
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-medium capitalize text-muted-foreground transition hover:text-foreground",
            option === granularity && "bg-primary text-primary-foreground hover:text-primary-foreground"
          )}
          href={buildHref(pathname, params, { granularity: option })}
        >
          {option}
        </a>
      ))}
    </div>
  );
}
