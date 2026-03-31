"use client";

import { useState, useTransition } from "react";
import { LayoutGrid, LoaderCircle, PanelTop, Plus, Sparkles } from "lucide-react";

import { DashboardTabBar } from "@/components/dashboard/dashboard-tab-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type DashboardBuilderConfig,
  type DashboardBuilderConfigRecord,
  type DashboardTab,
  type DashboardWidget
} from "@/lib/dashboard-builder";

const WIDGET_TYPE_LABELS: Record<DashboardWidget["type"], string> = {
  kpi: "KPI",
  line: "Line chart",
  bar: "Bar chart",
  table: "Table"
};

function buildTabId() {
  return `tab-${Math.random().toString(36).slice(2, 10)}`;
}

function buildTabTitle(tabs: DashboardTab[]) {
  return `Tab ${tabs.length + 1}`;
}

function getWidgetSummary(widget: DashboardWidget) {
  switch (widget.type) {
    case "kpi":
      return widget.config.metricKey.replaceAll("_", " ");
    case "line":
    case "bar":
      return `${widget.config.metricKeys.length} metrics`;
    case "table":
      return `${widget.config.dataset} dataset`;
    default:
      return "Placeholder";
  }
}

async function saveConfig(config: DashboardBuilderConfig) {
  const response = await fetch("/api/dashboard-builder", {
    body: JSON.stringify(config),
    headers: { "content-type": "application/json" },
    method: "PUT"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to save dashboard builder config.");
  }

  return (await response.json()) as DashboardBuilderConfigRecord;
}

function BuilderCanvas({
  onAddWidget,
  tab
}: {
  onAddWidget: () => void;
  tab: DashboardTab;
}) {
  if (tab.widgets.length === 0) {
    return (
      <Card className="border-dashed border-border/70 bg-gradient-to-br from-background via-background to-muted/50">
        <CardHeader className="items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Badge className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
              Empty canvas
            </Badge>
            <CardTitle className="text-2xl">Start with a widget</CardTitle>
            <CardDescription className="max-w-xl">
              This tab is ready for widgets. Rendering and layout tools land in later milestones.
            </CardDescription>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={onAddWidget}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add placeholder
          </button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-dashed border-border/70 bg-muted/35 p-5">
            <PanelTop className="h-5 w-5 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">Tab-level structure</p>
            <p className="mt-1 text-sm text-muted-foreground">Tabs define the top-level dashboard story.</p>
          </div>
          <div className="rounded-3xl border border-dashed border-border/70 bg-muted/35 p-5">
            <LayoutGrid className="h-5 w-5 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">Widget slots</p>
            <p className="mt-1 text-sm text-muted-foreground">Cards appear as builder placeholders for now.</p>
          </div>
          <div className="rounded-3xl border border-dashed border-border/70 bg-muted/35 p-5">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">Minimal by default</p>
            <p className="mt-1 text-sm text-muted-foreground">The shell stays quiet until real widgets are added.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tab.widgets.map((widget) => (
        <Card key={widget.id} className="bg-background/95">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{widget.title}</CardTitle>
                <CardDescription className="mt-2">
                  {widget.description ?? "Builder placeholder. Widget rendering ships in a later milestone."}
                </CardDescription>
              </div>
              <Badge className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
                {WIDGET_TYPE_LABELS[widget.type]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-3xl border border-dashed border-border/70 bg-muted/35 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Placeholder</p>
              <p className="mt-3 text-sm font-medium capitalize">{getWidgetSummary(widget)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Layout {widget.layout.w} x {widget.layout.h}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DashboardBuilderShell({
  initialRecord
}: {
  initialRecord: DashboardBuilderConfigRecord;
}) {
  const [record, setRecord] = useState(initialRecord);
  const [activeTabId, setActiveTabId] = useState(initialRecord.config.tabs[0]?.id ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeTab = record.config.tabs.find((tab) => tab.id === activeTabId) ?? record.config.tabs[0];

  function persistConfig(nextConfig: DashboardBuilderConfig, nextActiveTabId: string) {
    setRecord((current) => ({ ...current, config: nextConfig }));
    setActiveTabId(nextActiveTabId);
    setSaveError(null);

    startTransition(() => {
      void saveConfig(nextConfig)
        .then((saved) => {
          setRecord(saved);
          setActiveTabId((current) => (saved.config.tabs.some((tab) => tab.id === current) ? current : nextActiveTabId));
        })
        .catch((error: unknown) => {
          setSaveError(error instanceof Error ? error.message : "Failed to save dashboard builder config.");
        });
    });
  }

  function handleAddTab() {
    const nextTab: DashboardTab = {
      description: null,
      id: buildTabId(),
      title: buildTabTitle(record.config.tabs),
      widgets: []
    };

    persistConfig(
      {
        ...record.config,
        tabs: [...record.config.tabs, nextTab]
      },
      nextTab.id
    );
  }

  function handleAddPlaceholderWidget() {
    if (!activeTab) {
      return;
    }

    const nextConfig = {
      ...record.config,
      tabs: record.config.tabs.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              widgets: [
                ...tab.widgets,
                {
                  config: { comparison: "none", format: "number", metricKey: "tickets_created" },
                  description: "Placeholder widget card for builder shell testing.",
                  id: `${tab.id}-widget-${tab.widgets.length + 1}`,
                  layout: { h: 3, minH: 2, minW: 2, w: 4, x: 0, y: tab.widgets.length * 3 },
                  title: `Widget ${tab.widgets.length + 1}`,
                  type: "kpi"
                }
              ]
            }
          : tab
      )
    } satisfies DashboardBuilderConfig;

    persistConfig(nextConfig, activeTab.id);
  }

  if (!activeTab) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-border/60 bg-gradient-to-br from-stone-100 via-background to-emerald-50 p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Dashboard builder
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Build dashboards tab by tab.</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A lighter workspace for organizing tabs and staging widgets before richer builder controls arrive.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            <span>{isPending ? "Saving changes" : "Saved to your workspace"}</span>
          </div>
        </div>
      </section>

      <DashboardTabBar
        activeTabId={activeTab.id}
        disabled={isPending}
        onAddTab={handleAddTab}
        onSelectTab={setActiveTabId}
        tabs={record.config.tabs}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="bg-background/95">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Canvas</p>
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle className="text-2xl">{activeTab.title}</CardTitle>
                <CardDescription className="mt-2">
                  {activeTab.description ?? "Widgets in this tab stay in placeholder mode for this milestone."}
                </CardDescription>
              </div>
              <Badge className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
                {activeTab.widgets.length === 1 ? "1 widget" : `${activeTab.widgets.length} widgets`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <BuilderCanvas onAddWidget={handleAddPlaceholderWidget} tab={activeTab} />
          </CardContent>
        </Card>

        <Card className="bg-muted/20">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Inspector</p>
            <CardTitle>Current tab</CardTitle>
            <CardDescription>High-level structure only. Configuration tools come later.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-3xl border border-border/70 bg-background px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tab title</p>
              <p className="mt-2 font-medium">{activeTab.title}</p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Widgets</p>
              <p className="mt-2 font-medium">{activeTab.widgets.length}</p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Updated</p>
              <p className="mt-2 font-medium">{new Date(record.updatedAt).toLocaleString("en-GB")}</p>
            </div>
            {saveError ? (
              <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">{saveError}</div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
