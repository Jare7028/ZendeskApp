import Link from "next/link";

import { cn } from "@/lib/utils";

import { buildDashboardHref } from "./dashboard-query";

export type OverviewSection = "operations" | "service" | "workforce";

const SECTIONS: Array<{ id: OverviewSection; label: string; description: string }> = [
  {
    id: "operations",
    label: "Operations",
    description: "Volume, channel mix, and throughput"
  },
  {
    id: "service",
    label: "Service",
    description: "SLA health and response performance"
  },
  {
    id: "workforce",
    label: "Workforce",
    description: "Staffing coverage and capacity context"
  }
];

export function OverviewSectionSwitcher({
  section,
  params
}: {
  section: OverviewSection;
  params: Record<string, string>;
}) {
  return (
    <section className="rounded-[28px] border border-border/60 bg-card/80 p-4 shadow-panel">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Overview sections</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Choose the portfolio lens</h3>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          These sections keep portfolio analytics grouped by operational question instead of mixing intake, SLA, and
          staffing signals into one surface.
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {SECTIONS.map((item) => (
          <Link
            key={item.id}
            className={cn(
              "rounded-[24px] border px-4 py-4 transition-colors",
              item.id === section ? "border-primary bg-primary/5" : "border-border/70 bg-background/70 hover:bg-muted/40"
            )}
            href={buildDashboardHref(params, { section: item.id, view: "overview" })}
          >
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.16em]",
                item.id === section ? "text-primary" : "text-muted-foreground"
              )}
            >
              {item.id === section ? "Active section" : "Section"}
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">{item.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
