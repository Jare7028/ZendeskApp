import Link from "next/link";

import { type DashboardView } from "@/lib/metrics/dashboard";
import { cn } from "@/lib/utils";

import { buildDashboardHref } from "./dashboard-query";

const views: Array<{ id: DashboardView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Agents" },
  { id: "clients", label: "Clients" }
];

export function DashboardViewSwitcher({
  view,
  params
}: {
  view: DashboardView;
  params: Record<string, string>;
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-background/70 p-1">
      {views.map((item) => (
        <Link
          key={item.id}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition-colors",
            item.id === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
          href={buildDashboardHref(params, { view: item.id })}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
