"use client";

import { CalendarRange, Filter, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type DashboardTab, type DashboardTabHardFilters } from "@/lib/dashboard-builder";

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatClientScopeLabel(clientId: string, clients: Array<{ id: string; name: string }>) {
  if (clientId === "all") {
    return "All permitted clients";
  }

  return clients.find((client) => client.id === clientId)?.name ?? "Selected client";
}

export function DashboardTabBar({
  activeTab,
  activeTabId,
  clients,
  disabled,
  onAddTab,
  onUpdateTitle,
  onUpdateHardFilters,
  onUpdateDateRange,
  onSelectTab,
  tabs
}: {
  activeTab: DashboardTab | null;
  activeTabId: string;
  clients: Array<{ id: string; name: string }>;
  disabled: boolean;
  onAddTab: () => void;
  onUpdateTitle: (tabId: string, nextTitle: string) => void;
  onUpdateHardFilters: (tabId: string, nextHardFilters: DashboardTabHardFilters) => void;
  onUpdateDateRange: (tabId: string, nextDateRange: DashboardTab["dateRange"]) => void;
  onSelectTab: (tabId: string) => void;
  tabs: DashboardTab[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[28px] border border-border/60 bg-background/95 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Tabs</p>
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
              <p className={cn("mt-1 truncate text-[11px]", isActive ? "text-background/80" : "text-muted-foreground")}>
                {formatDateLabel(tab.dateRange.start)} to {formatDateLabel(tab.dateRange.end)}
              </p>
              <p className={cn("mt-1 truncate text-[11px]", isActive ? "text-background/80" : "text-muted-foreground")}>
                {formatClientScopeLabel(tab.hardFilters.clientId, clients)}
              </p>
            </button>
          );
        })}
      </div>

      {activeTab ? (
        <div className="rounded-3xl border border-border/70 bg-muted/25 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tab scope</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground">
                  <CalendarRange className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {formatDateLabel(activeTab.dateRange.start)} to {formatDateLabel(activeTab.dateRange.end)}
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span>{formatClientScopeLabel(activeTab.hardFilters.clientId, clients)}</span>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <Label htmlFor={`${activeTab.id}-title`}>Tab name</Label>
                <Input
                  defaultValue={activeTab.title}
                  disabled={disabled}
                  id={`${activeTab.id}-title`}
                  key={`${activeTab.id}-title`}
                  onBlur={(event) => {
                    const value = event.currentTarget.value.trim();

                    if (!value) {
                      event.currentTarget.value = activeTab.title;
                      return;
                    }

                    if (value !== activeTab.title) {
                      onUpdateTitle(activeTab.id, value);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="Tab name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${activeTab.id}-start`}>Start date</Label>
                <Input
                  disabled={disabled}
                  id={`${activeTab.id}-start`}
                  max={activeTab.dateRange.end}
                  onChange={(event) => {
                    if (!event.currentTarget.value) {
                      return;
                    }

                    onUpdateDateRange(activeTab.id, {
                      start: event.currentTarget.value,
                      end: activeTab.dateRange.end
                    });
                  }}
                  type="date"
                  value={activeTab.dateRange.start}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${activeTab.id}-end`}>End date</Label>
                <Input
                  disabled={disabled}
                  id={`${activeTab.id}-end`}
                  min={activeTab.dateRange.start}
                  onChange={(event) => {
                    if (!event.currentTarget.value) {
                      return;
                    }

                    onUpdateDateRange(activeTab.id, {
                      start: activeTab.dateRange.start,
                      end: event.currentTarget.value
                    });
                  }}
                  type="date"
                  value={activeTab.dateRange.end}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${activeTab.id}-client-filter`}>Hard client filter</Label>
                <select
                  className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={disabled}
                  id={`${activeTab.id}-client-filter`}
                  onChange={(event) => {
                    onUpdateHardFilters(activeTab.id, {
                      clientId: event.currentTarget.value
                    });
                  }}
                  value={activeTab.hardFilters.clientId}
                >
                  <option value="all">All permitted clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
