import Link from "next/link";

import { type DashboardView } from "@/lib/metrics/dashboard";
import { cn } from "@/lib/utils";

import { buildDashboardHref } from "./dashboard-query";

const views: Array<{ id: DashboardView; label: string; eyebrow: string; description: string }> = [
  {
    id: "overview",
    label: "Portfolio overview",
    eyebrow: "Workspace",
    description: "Read overall intake, service health, and staffing signals across the current scope."
  },
  {
    id: "clients",
    label: "Client comparison",
    eyebrow: "Comparison",
    description: "Compare client portfolios side by side to find pressure, risk, and easier coverage."
  },
  {
    id: "agents",
    label: "Agent analysis",
    eyebrow: "Performance",
    description: "Inspect agent workload and response outcomes without mixing them into portfolio rollups."
  }
];

export function DashboardViewSwitcher({
  view,
  params
}: {
  view: DashboardView;
  params: Record<string, string>;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {views.map((item) => (
        <Link
          key={item.id}
          className={cn(
            "rounded-[24px] border px-4 py-4 transition-colors",
            item.id === view
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border/70 bg-background/70 hover:border-border hover:bg-muted/30"
          )}
          href={buildDashboardHref(params, { view: item.id })}
        >
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.18em]",
              item.id === view ? "text-primary" : "text-muted-foreground"
            )}
          >
            {item.eyebrow}
          </p>
          <p className="mt-2 text-base font-semibold text-foreground">{item.label}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
        </Link>
      ))}
    </div>
  );
}
