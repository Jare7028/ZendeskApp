"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DashboardTab } from "@/lib/dashboard-builder";

export function DashboardTabBar({
  activeTabId,
  disabled,
  onAddTab,
  onSelectTab,
  tabs
}: {
  activeTabId: string;
  disabled: boolean;
  onAddTab: () => void;
  onSelectTab: (tabId: string) => void;
  tabs: DashboardTab[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[28px] border border-border/60 bg-background/95 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Tabs</p>
          <p className="mt-1 text-sm text-muted-foreground">Switch context or start a fresh canvas.</p>
        </div>
        <Button className="gap-2" disabled={disabled} onClick={onAddTab} variant="outline">
          <Plus className="h-4 w-4" />
          New tab
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <button
              key={tab.id}
              className={cn(
                "min-w-[120px] rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isActive
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border/70 bg-muted/40 text-foreground hover:border-border hover:bg-muted"
              )}
              onClick={() => onSelectTab(tab.id)}
              type="button"
            >
              <p className="truncate text-sm font-medium">{tab.title}</p>
              <p className={cn("mt-1 truncate text-xs", isActive ? "text-background/70" : "text-muted-foreground")}>
                {tab.widgets.length === 1 ? "1 widget" : `${tab.widgets.length} widgets`}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
