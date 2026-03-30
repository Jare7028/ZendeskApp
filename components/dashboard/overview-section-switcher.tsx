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
    <div className="grid gap-2 md:grid-cols-3">
      {SECTIONS.map((item) => (
        <Link
          key={item.id}
          className={cn(
            "rounded-[24px] border px-4 py-4 transition-colors",
            item.id === section ? "border-primary bg-primary/5" : "border-border/70 bg-card/70 hover:bg-muted/40"
          )}
          href={buildDashboardHref(params, { section: item.id, view: "overview" })}
        >
          <p className="text-sm font-semibold text-foreground">{item.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
        </Link>
      ))}
    </div>
  );
}
