"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  LayoutGrid,
  LoaderCircle,
  Minus,
  PanelTop,
  Plus,
  Sparkles,
  Trash2
} from "lucide-react";

import { DashboardTabBar } from "@/components/dashboard/dashboard-tab-bar";
import { DashboardWidgetInspector } from "@/components/dashboard/dashboard-widget-inspector";
import { formatMinutes, formatNumber, formatPercent } from "@/components/dashboard/dashboard-format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  METRIC_FORMATS,
  METRIC_LABELS,
  TABLE_COLUMN_LABELS
} from "@/lib/dashboard-builder-metadata";
import {
  type DashboardBuilderConfig,
  type DashboardBuilderConfigRecord,
  type DashboardMetricKey,
  type DashboardTab,
  type DashboardTabDateRange,
  type DashboardTabHardFilters,
  type DashboardTableColumnKey,
  type DashboardWidget,
  type DashboardWidgetType
} from "@/lib/dashboard-builder";
import { type DashboardData } from "@/lib/metrics/dashboard";
import { cn } from "@/lib/utils";

type BuilderOverviewSnapshot = {
  totalInteractions: number;
  totalReplies: number;
  totalHoursWorked: number;
  interactionsPerHourWorked: number | null;
  repliesPerHourWorked: number | null;
  agentUtilisationRatio: number | null;
  repliesPerTicket: number | null;
  reopensPerAgent: number | null;
  avgFirstReplyMinutes: number | null;
  medianFirstReplyMinutes: number | null;
  p90FirstReplyMinutes: number | null;
  avgFullResolutionMinutes: number | null;
  medianFullResolutionMinutes: number | null;
  p90FullResolutionMinutes: number | null;
  requesterWaitTimeMinutes: number | null;
  slaFirstReplyCompliance: number | null;
  slaFullResolutionCompliance: number | null;
};

type BuilderDashboardData = {
  current: BuilderOverviewSnapshot;
  previous: BuilderOverviewSnapshot | null;
  trends: Array<{
    date: string;
    interactions: number;
    hoursWorked: number;
    avgFirstReplyMinutes: number | null;
    avgFullResolutionMinutes: number | null;
  }>;
  channels: DashboardData["trends"]["channel"];
  agents: Array<{
    id: string;
    name: string;
    client: string;
    ticketsCreated: number;
    ticketReplies: number;
    hoursWorked: number;
    interactionsPerHourWorked: number | null;
    avgFirstReplyMinutes: number | null;
    avgFullResolutionMinutes: number | null;
    agentUtilisationRatio: number | null;
    reopens: number;
  }>;
  clients: Array<{
    id: string;
    client: string;
    ticketsCreated: number;
    hoursWorked: number;
    interactionsPerHourWorked: number | null;
    avgFirstReplyMinutes: number | null;
    avgFullResolutionMinutes: number | null;
    agentUtilisationRatio: number | null;
    repliesPerTicket: number | null;
    slaFirstReplyCompliance: number | null;
    slaFullResolutionCompliance: number | null;
  }>;
};

type BuilderBarDatum = {
  id: string;
  label: string;
  hint: string | null;
  values: Partial<Record<DashboardMetricKey, number | null>>;
};

type BuilderTableRow = {
  id: string;
  name: string;
  client: string;
  tickets_created: number | null;
  ticket_replies: number | null;
  hours_worked: number | null;
  interactions_per_hour_worked: number | null;
  replies_per_ticket: number | null;
  avg_first_reply_minutes: number | null;
  avg_full_resolution_minutes: number | null;
  agent_utilisation_ratio: number | null;
  sla_first_reply_compliance: number | null;
  sla_full_resolution_compliance: number | null;
  reopens: number | null;
};

const CHART_COLORS = ["#0f766e", "#d97706", "#0f4c81", "#7c6f64"] as const;
const DASHBOARD_GRID_COLUMNS = 12;
const DASHBOARD_GRID_ROW_HEIGHT = 72;

type LayoutDirection = "down" | "left" | "right" | "up";
type LayoutDimension = "h" | "w";
type TabRuntimeData = {
  current: DashboardData;
  previous: DashboardData | null;
};

type BuilderClientOption = {
  id: string;
  name: string;
};

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function buildDefaultTabDateRange(): DashboardTabDateRange {
  const today = new Date();
  return {
    start: formatISODate(addDays(today, -27)),
    end: formatISODate(today)
  };
}

function normalizeDateRange(dateRange: DashboardTabDateRange): DashboardTabDateRange {
  return dateRange.start <= dateRange.end
    ? dateRange
    : {
        start: dateRange.end,
        end: dateRange.start
      };
}

function getDateRangeKey(dateRange: DashboardTabDateRange) {
  return `${dateRange.start}:${dateRange.end}`;
}

function getTabDataKey(tab: Pick<DashboardTab, "dateRange" | "hardFilters">) {
  return `${getDateRangeKey(tab.dateRange)}:${tab.hardFilters.clientId}`;
}

function formatDateRangeLabel(dateRange: DashboardTabDateRange) {
  return `${dateRange.start} to ${dateRange.end}`;
}

function formatClientScopeLabel(clientId: string, clients: BuilderClientOption[]) {
  if (clientId === "all") {
    return "All permitted clients";
  }

  return clients.find((client) => client.id === clientId)?.name ?? "Selected client";
}

function buildBuilderDashboardData(current: DashboardData, previous: DashboardData | null = null): BuilderDashboardData {
  const buildSnapshot = (data: DashboardData): BuilderOverviewSnapshot => ({
    totalInteractions: data.overview.totalInteractions,
    totalReplies: data.overview.totalReplies,
    totalHoursWorked: data.trends.volume.reduce((total, point) => total + point.hoursWorked, 0),
    interactionsPerHourWorked: data.overview.interactionsPerHourWorked,
    repliesPerHourWorked: data.overview.repliesPerHourWorked,
    agentUtilisationRatio: data.overview.agentUtilisationRatio,
    repliesPerTicket: data.overview.repliesPerTicket,
    reopensPerAgent: data.overview.reopensPerAgent,
    avgFirstReplyMinutes: data.overview.avgFirstReplyMinutes,
    medianFirstReplyMinutes: data.overview.medianFirstReplyMinutes,
    p90FirstReplyMinutes: data.overview.p90FirstReplyMinutes,
    avgFullResolutionMinutes: data.overview.avgFullResolutionMinutes,
    medianFullResolutionMinutes: data.overview.medianFullResolutionMinutes,
    p90FullResolutionMinutes: data.overview.p90FullResolutionMinutes,
    requesterWaitTimeMinutes: data.overview.requesterWaitTimeMinutes,
    slaFirstReplyCompliance: data.sla?.firstReply.complianceRate ?? null,
    slaFullResolutionCompliance: data.sla?.fullResolution.complianceRate ?? null
  });

  return {
    current: buildSnapshot(current),
    previous: previous ? buildSnapshot(previous) : null,
    trends: current.trends.volume.map((point, index) => ({
      date: point.date,
      interactions: point.interactions,
      hoursWorked: point.hoursWorked,
      avgFirstReplyMinutes: current.trends.response[index]?.avgFirstReplyMinutes ?? null,
      avgFullResolutionMinutes: current.trends.response[index]?.avgFullResolutionMinutes ?? null
    })),
    channels: current.trends.channel,
    agents: current.leaderboard.rows.map((row) => ({
      id: row.agentId,
      name: row.agentName,
      client: row.clientName,
      ticketsCreated: row.totalInteractions,
      ticketReplies: row.totalReplies,
      hoursWorked: row.totalHoursWorked,
      interactionsPerHourWorked: row.interactionsPerHourWorked,
      avgFirstReplyMinutes: row.avgFirstReplyMinutes,
      avgFullResolutionMinutes: row.avgFullResolutionMinutes,
      agentUtilisationRatio: row.utilisation,
      reopens: row.totalReopens
    })),
    clients: current.clients.rows.map((row) => ({
      id: row.clientId,
      client: row.clientName,
      ticketsCreated: row.totalInteractions,
      hoursWorked: row.totalHoursWorked,
      interactionsPerHourWorked: row.interactionsPerHourWorked,
      avgFirstReplyMinutes: row.avgFirstReplyMinutes,
      avgFullResolutionMinutes: row.avgFullResolutionMinutes,
      agentUtilisationRatio: row.utilisation,
      repliesPerTicket: row.repliesPerTicket,
      slaFirstReplyCompliance: row.firstReplyComplianceRate,
      slaFullResolutionCompliance: row.fullResolutionComplianceRate
    }))
  };
}

function getMetricLabel(metricKey: DashboardMetricKey) {
  return METRIC_LABELS[metricKey];
}

function getMetricFormat(metricKey: DashboardMetricKey) {
  return METRIC_FORMATS[metricKey];
}

function getMetricValue(snapshot: BuilderOverviewSnapshot, metricKey: DashboardMetricKey) {
  switch (metricKey) {
    case "tickets_created":
      return snapshot.totalInteractions;
    case "ticket_replies":
      return snapshot.totalReplies;
    case "hours_worked":
      return snapshot.totalHoursWorked;
    case "interactions_per_hour_worked":
      return snapshot.interactionsPerHourWorked;
    case "replies_per_hour_worked":
      return snapshot.repliesPerHourWorked;
    case "replies_per_ticket":
      return snapshot.repliesPerTicket;
    case "avg_first_reply_minutes":
      return snapshot.avgFirstReplyMinutes;
    case "avg_full_resolution_minutes":
      return snapshot.avgFullResolutionMinutes;
    case "median_first_reply_minutes":
      return snapshot.medianFirstReplyMinutes;
    case "median_full_resolution_minutes":
      return snapshot.medianFullResolutionMinutes;
    case "p90_first_reply_minutes":
      return snapshot.p90FirstReplyMinutes;
    case "p90_full_resolution_minutes":
      return snapshot.p90FullResolutionMinutes;
    case "agent_utilisation_ratio":
      return snapshot.agentUtilisationRatio;
    case "requester_wait_time_minutes":
      return snapshot.requesterWaitTimeMinutes;
    case "reopens":
    case "reopens_per_agent":
      return snapshot.reopensPerAgent;
    case "sla_first_reply_compliance":
      return snapshot.slaFirstReplyCompliance;
    case "sla_full_resolution_compliance":
      return snapshot.slaFullResolutionCompliance;
    default:
      return null;
  }
}

function getMetricSeries(data: BuilderDashboardData, metricKey: DashboardMetricKey) {
  switch (metricKey) {
    case "tickets_created":
      return data.trends.map((point) => ({ date: point.date, value: point.interactions }));
    case "hours_worked":
      return data.trends.map((point) => ({ date: point.date, value: point.hoursWorked }));
    case "avg_first_reply_minutes":
      return data.trends.map((point) => ({ date: point.date, value: point.avgFirstReplyMinutes }));
    case "avg_full_resolution_minutes":
      return data.trends.map((point) => ({ date: point.date, value: point.avgFullResolutionMinutes }));
    default:
      return [];
  }
}

function getBarData(data: BuilderDashboardData, widget: Extract<DashboardWidget, { type: "bar" }>): BuilderBarDatum[] {
  if (widget.config.dimension === "channel") {
    const totals = data.channels.reduce(
      (accumulator, point) => ({
        email: accumulator.email + point.email,
        chat: accumulator.chat + point.chat,
        phone: accumulator.phone + point.phone,
        other: accumulator.other + point.other
      }),
      { email: 0, chat: 0, phone: 0, other: 0 }
    );

    return [
      { id: "email", label: "Email", hint: null, values: { tickets_created: totals.email } },
      { id: "chat", label: "Chat", hint: null, values: { tickets_created: totals.chat } },
      { id: "phone", label: "Phone", hint: null, values: { tickets_created: totals.phone } },
      { id: "other", label: "Other", hint: null, values: { tickets_created: totals.other } }
    ];
  }

  const rows: BuilderBarDatum[] =
    widget.config.dimension === "agent"
      ? data.agents.map((row) => ({
          id: row.id,
          label: row.name,
          hint: row.client,
          values: {
            tickets_created: row.ticketsCreated,
            ticket_replies: row.ticketReplies,
            hours_worked: row.hoursWorked,
            interactions_per_hour_worked: row.interactionsPerHourWorked,
            avg_first_reply_minutes: row.avgFirstReplyMinutes,
            avg_full_resolution_minutes: row.avgFullResolutionMinutes,
            agent_utilisation_ratio: row.agentUtilisationRatio,
            reopens: row.reopens,
            reopens_per_agent: row.reopens
          } satisfies Partial<Record<DashboardMetricKey, number | null>>
        }))
      : data.clients.map((row) => ({
          id: row.id,
          label: row.client,
          hint: null,
          values: {
            tickets_created: row.ticketsCreated,
            hours_worked: row.hoursWorked,
            interactions_per_hour_worked: row.interactionsPerHourWorked,
            avg_first_reply_minutes: row.avgFirstReplyMinutes,
            avg_full_resolution_minutes: row.avgFullResolutionMinutes,
            agent_utilisation_ratio: row.agentUtilisationRatio,
            replies_per_ticket: row.repliesPerTicket,
            sla_first_reply_compliance: row.slaFirstReplyCompliance,
            sla_full_resolution_compliance: row.slaFullResolutionCompliance
          } satisfies Partial<Record<DashboardMetricKey, number | null>>
        }));

  const primaryMetric = widget.config.metricKeys[0] ?? "tickets_created";

  return rows
    .filter((row) => widget.config.metricKeys.some((metricKey) => ((row.values as Partial<Record<DashboardMetricKey, number | null>>)[metricKey] ?? null) !== null))
    .sort((left, right) => (((right.values as Partial<Record<DashboardMetricKey, number | null>>)[primaryMetric] ?? 0) - ((left.values as Partial<Record<DashboardMetricKey, number | null>>)[primaryMetric] ?? 0)))
    .slice(0, 6);
}

function getTableData(data: BuilderDashboardData, widget: Extract<DashboardWidget, { type: "table" }>): BuilderTableRow[] {
  const rows: BuilderTableRow[] =
    widget.config.dataset === "agents"
      ? data.agents.map((row) => ({
          id: row.id,
          name: row.name,
          client: row.client,
          tickets_created: row.ticketsCreated,
          ticket_replies: row.ticketReplies,
          hours_worked: row.hoursWorked,
          interactions_per_hour_worked: row.interactionsPerHourWorked,
          replies_per_ticket: null,
          avg_first_reply_minutes: row.avgFirstReplyMinutes,
          avg_full_resolution_minutes: row.avgFullResolutionMinutes,
          agent_utilisation_ratio: row.agentUtilisationRatio,
          sla_first_reply_compliance: null,
          sla_full_resolution_compliance: null,
          reopens: row.reopens
        }))
      : data.clients.map((row) => ({
          id: row.id,
          name: row.client,
          client: row.client,
          tickets_created: row.ticketsCreated,
          ticket_replies: null,
          hours_worked: row.hoursWorked,
          interactions_per_hour_worked: row.interactionsPerHourWorked,
          replies_per_ticket: row.repliesPerTicket,
          avg_first_reply_minutes: row.avgFirstReplyMinutes,
          avg_full_resolution_minutes: row.avgFullResolutionMinutes,
          agent_utilisation_ratio: row.agentUtilisationRatio,
          sla_first_reply_compliance: row.slaFirstReplyCompliance,
          sla_full_resolution_compliance: row.slaFullResolutionCompliance,
          reopens: null
        }));

  return rows
    .slice()
    .sort((left, right) => {
      const leftValue = left[widget.config.sort.key];
      const rightValue = right[widget.config.sort.key];

      if (leftValue === null && rightValue === null) {
        return 0;
      }
      if (leftValue === null) {
        return 1;
      }
      if (rightValue === null) {
        return -1;
      }

      const comparison =
        typeof leftValue === "string" && typeof rightValue === "string"
          ? leftValue.localeCompare(rightValue, "en-GB")
          : Number(leftValue) - Number(rightValue);

      return widget.config.sort.direction === "asc" ? comparison : -comparison;
    })
    .slice(0, widget.config.limit);
}

function formatBuilderPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return value > 1.5 ? `${value.toFixed(1)}%` : formatPercent(value);
}

function formatBuilderValue(value: number | null, format: "number" | "percent" | "minutes") {
  if (format === "percent") {
    return formatBuilderPercent(value);
  }

  if (format === "minutes") {
    return formatMinutes(value);
  }

  return formatNumber(value, Math.abs(value ?? 0) >= 100 ? 0 : 2);
}

function formatTableValue(column: DashboardTableColumnKey, value: string | number | null) {
  if (column === "name" || column === "client") {
    return typeof value === "string" ? value : "No data";
  }

  if (
    column === "agent_utilisation_ratio" ||
    column === "sla_first_reply_compliance" ||
    column === "sla_full_resolution_compliance"
  ) {
    return formatBuilderPercent(typeof value === "number" ? value : null);
  }

  if (column === "avg_first_reply_minutes" || column === "avg_full_resolution_minutes") {
    return formatMinutes(typeof value === "number" ? value : null);
  }

  return formatNumber(typeof value === "number" ? value : null, column === "hours_worked" || column === "replies_per_ticket" ? 1 : 0);
}

function buildLinePath(values: number[], width: number, height: number, maxValue: number) {
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / Math.max(values.length - 1, 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function sortWidgetsForCanvas(widgets: DashboardWidget[]) {
  return widgets
    .slice()
    .sort((left, right) => {
      if (left.layout.y !== right.layout.y) {
        return left.layout.y - right.layout.y;
      }
      if (left.layout.x !== right.layout.x) {
        return left.layout.x - right.layout.x;
      }

      return left.id.localeCompare(right.id, "en-GB");
    });
}

function clampWidgetLayout(widget: DashboardWidget): DashboardWidget {
  const minW = Math.min(widget.layout.minW ?? 2, DASHBOARD_GRID_COLUMNS);
  const maxWidth = Math.max(minW, DASHBOARD_GRID_COLUMNS);
  const width = Math.max(minW, Math.min(widget.layout.w, maxWidth));
  const maxX = Math.max(0, DASHBOARD_GRID_COLUMNS - width);

  return {
    ...widget,
    layout: {
      ...widget.layout,
      x: Math.max(0, Math.min(widget.layout.x, maxX)),
      y: Math.max(0, widget.layout.y),
      w: width,
      h: Math.max(widget.layout.minH ?? 2, widget.layout.h)
    }
  };
}

function widgetsOverlap(left: DashboardWidget, right: DashboardWidget) {
  return !(
    left.layout.x + left.layout.w <= right.layout.x ||
    right.layout.x + right.layout.w <= left.layout.x ||
    left.layout.y + left.layout.h <= right.layout.y ||
    right.layout.y + right.layout.h <= left.layout.y
  );
}

function packWidgets(widgets: DashboardWidget[]) {
  const placed: DashboardWidget[] = [];

  for (const widget of sortWidgetsForCanvas(widgets).map(clampWidgetLayout)) {
    const maxX = Math.max(0, DASHBOARD_GRID_COLUMNS - widget.layout.w);
    const nextWidget = {
      ...widget,
      layout: {
        ...widget.layout,
        x: Math.min(widget.layout.x, maxX)
      }
    };

    while (placed.some((placedWidget) => widgetsOverlap(nextWidget, placedWidget))) {
      nextWidget.layout = {
        ...nextWidget.layout,
        y: nextWidget.layout.y + 1
      };
    }

    placed.push(nextWidget);
  }

  return sortWidgetsForCanvas(placed);
}

function DashboardBuilderWidgetCard({
  disabled,
  isSelected,
  onDelete,
  onMove,
  onResize,
  onSelect,
  widget,
  data,
  previousData
}: {
  disabled?: boolean;
  isSelected: boolean;
  onDelete: () => void;
  onMove: (direction: LayoutDirection) => void;
  onResize: (dimension: LayoutDimension, delta: number) => void;
  onSelect: () => void;
  widget: DashboardWidget;
  data: DashboardData;
  previousData?: DashboardData | null;
}) {
  const builderData = buildBuilderDashboardData(data, previousData ?? null);
  const canShrinkWidth = widget.layout.w > (widget.layout.minW ?? 2);
  const canShrinkHeight = widget.layout.h > (widget.layout.minH ?? 2);
  const canGrowWidth = widget.layout.w < DASHBOARD_GRID_COLUMNS;
  const canGrowHeight = widget.layout.h < 12;

  const controls = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/95 p-1">
        {([
          ["up", ArrowUp, "Move up"],
          ["left", ArrowLeft, "Move left"],
          ["right", ArrowRight, "Move right"],
          ["down", ArrowDown, "Move down"]
        ] as const).map(([direction, Icon, label]) => (
          <button
            key={direction}
            aria-label={label}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onMove(direction);
            }}
            type="button"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/95 p-1">
        <button
          aria-label="Decrease width"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled || !canShrinkWidth}
          onClick={(event) => {
            event.stopPropagation();
            onResize("w", -1);
          }}
          type="button"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-16 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {widget.layout.w} x {widget.layout.h}
        </span>
        <button
          aria-label="Increase width"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled || !canGrowWidth}
          onClick={(event) => {
            event.stopPropagation();
            onResize("w", 1);
          }}
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          aria-label="Decrease height"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled || !canShrinkHeight}
          onClick={(event) => {
            event.stopPropagation();
            onResize("h", -1);
          }}
          type="button"
        >
          <ArrowDown className="h-4 w-4 rotate-90" />
        </button>
        <button
          aria-label="Increase height"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled || !canGrowHeight}
          onClick={(event) => {
            event.stopPropagation();
            onResize("h", 1);
          }}
          type="button"
        >
          <ArrowUp className="h-4 w-4 rotate-90" />
        </button>
      </div>
      <button
        aria-label={`Delete ${widget.title}`}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
        Remove
      </button>
    </div>
  );

  if (widget.type === "kpi") {
    const currentValue = getMetricValue(builderData.current, widget.config.metricKey);
    const previousValue = builderData.previous ? getMetricValue(builderData.previous, widget.config.metricKey) : null;
    const delta =
      widget.config.comparison === "previous_period" && currentValue !== null && previousValue !== null
        ? `${currentValue - previousValue > 0 ? "+" : ""}${formatBuilderValue(
            currentValue - previousValue,
            widget.config.format
          )} vs previous`
        : null;

    return (
      <div
        className={cn(
          "flex h-full cursor-pointer flex-col justify-between rounded-[28px] border bg-gradient-to-br from-background to-muted/30 p-5 transition",
          isSelected ? "border-foreground shadow-sm ring-2 ring-foreground/10" : "border-border/60 hover:border-border"
        )}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold tracking-tight text-foreground">{widget.title}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {getMetricLabel(widget.config.metricKey)}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {formatBuilderValue(currentValue, widget.config.format)}
            </p>
          </div>
          <Badge className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
            KPI
          </Badge>
        </div>
        {isSelected ? <div className="mt-4">{controls}</div> : null}
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{widget.description ?? "Current window"}</span>
          {delta ? <span className="font-medium text-foreground">{delta}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full cursor-pointer flex-col rounded-[28px] border bg-background/95 p-5 transition",
        isSelected ? "border-foreground shadow-sm ring-2 ring-foreground/10" : "border-border/60 hover:border-border"
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tracking-tight text-foreground">{widget.title}</p>
          {widget.description ? <p className="mt-1 text-sm text-muted-foreground">{widget.description}</p> : null}
        </div>
        <Badge className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
          {widget.type === "line" ? "Line" : widget.type === "bar" ? "Bar" : "Table"}
        </Badge>
      </div>
      {isSelected ? <div className="mt-4">{controls}</div> : null}
      <div className="mt-5 flex-1">
        {widget.type === "line" ? (
          <div className="space-y-4">
            {(() => {
              const series = widget.config.metricKeys
                .map((metricKey) => ({
                  metricKey,
                  label: getMetricLabel(metricKey),
                  points: getMetricSeries(builderData, metricKey)
                }))
                .filter((entry) => entry.points.length > 0);

              if (series.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">This metric does not have a trend series in the builder yet.</p>
                );
              }

              const width = 640;
              const height = 180;
              const maxValue = Math.max(1, ...series.flatMap((entry) => entry.points.map((point) => point.value ?? 0)));
              const recentDates = series[0]?.points.slice(-4) ?? [];

              return (
                <>
                  <div className="flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {series.map((entry, index) => (
                      <span key={entry.metricKey} className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        {entry.label}
                      </span>
                    ))}
                  </div>
                  <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img">
                    {series.map((entry, index) => (
                      <path
                        key={entry.metricKey}
                        d={buildLinePath(
                          entry.points.map((point) => point.value ?? 0),
                          width,
                          height,
                          maxValue
                        )}
                        fill="none"
                        stroke={CHART_COLORS[index % CHART_COLORS.length]}
                        strokeLinecap="round"
                        strokeWidth="4"
                      />
                    ))}
                  </svg>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {recentDates.map((point) => (
                      <div key={point.date} className="rounded-2xl bg-muted/45 p-3">
                        <p className="text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat("en-GB", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC"
                          }).format(new Date(`${point.date}T00:00:00.000Z`))}
                        </p>
                        <div className="mt-2 space-y-1">
                          {series.map((entry, index) => {
                            const value = entry.points.find((candidate) => candidate.date === point.date)?.value ?? null;
                            return (
                              <p key={entry.metricKey} className="text-sm font-medium text-foreground">
                                <span
                                  className="mr-2 inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                />
                                {formatBuilderValue(value, getMetricFormat(entry.metricKey))}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
        {widget.type === "bar" ? (
          <div className="space-y-3">
            {(() => {
              const metricKeys =
                widget.config.dimension === "channel"
                  ? (["tickets_created"] as DashboardMetricKey[])
                  : widget.config.metricKeys;
              const rows = getBarData(builderData, widget);

              if (rows.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    This bar widget needs a supported metric for the selected dimension.
                  </p>
                );
              }

              return (
                <>
                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <span>{widget.config.dimension}</span>
                    <span>{rows.length} rows</span>
                  </div>
                  <div className="space-y-3">
                    {rows.map((row) => {
                      const maxValue = Math.max(1, ...metricKeys.map((metricKey) => row.values[metricKey] ?? 0));

                      return (
                        <div key={row.id} className="rounded-2xl bg-muted/35 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{row.label}</p>
                              {row.hint ? <p className="text-xs text-muted-foreground">{row.hint}</p> : null}
                            </div>
                          </div>
                          <div className="mt-3 space-y-2">
                            {metricKeys.map((metricKey, index) => {
                              const value = row.values[metricKey] ?? null;
                              const width = value !== null ? (value / maxValue) * 100 : 0;

                              return (
                                <div key={metricKey} className="space-y-1">
                                  <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                                      <span
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                      />
                                      {getMetricLabel(metricKey)}
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {formatBuilderValue(value, getMetricFormat(metricKey))}
                                    </span>
                                  </div>
                                  <div className="h-2.5 rounded-full bg-background/80">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                                        width: `${width}%`
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
        {widget.type === "table" ? (
          <div className="space-y-3">
            {(() => {
              const rows = getTableData(builderData, widget);

              if (rows.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    No {widget.config.dataset === "agents" ? "agents" : "clients"} matched this window.
                  </p>
                );
              }

              return (
                <>
                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <span>{widget.config.dataset === "agents" ? "Agents" : "Clients"}</span>
                    <span>{rows.length} rows</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-y-2">
                      <thead>
                        <tr>
                          {widget.config.columns.map((column) => (
                            <th
                              key={column}
                              className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground ${
                                column === "name" || column === "client" ? "text-left" : "text-right"
                              }`}
                            >
                              {TABLE_COLUMN_LABELS[column]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} className="rounded-2xl bg-muted/35">
                            {widget.config.columns.map((column, index) => (
                              <td
                                key={column}
                                className={[
                                  "px-3 py-3 text-sm",
                                  index === 0 ? "rounded-l-2xl font-medium text-foreground" : "",
                                  index === widget.config.columns.length - 1 ? "rounded-r-2xl" : "",
                                  column === "name" || column === "client" ? "text-left" : "text-right"
                                ].join(" ")}
                              >
                                {formatTableValue(column, row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildTabId() {
  return `tab-${Math.random().toString(36).slice(2, 10)}`;
}

function buildTabTitle(tabs: DashboardTab[]) {
  return `Tab ${tabs.length + 1}`;
}

function getWidgetTemplate(type: DashboardWidgetType) {
  switch (type) {
    case "line":
      return {
        config: { metricKeys: ["tickets_created", "hours_worked"], granularity: "daily", stacked: false },
        description: "Ticket volume against matched hours.",
        layout: { h: 4, minH: 3, minW: 3, w: 8, x: 0, y: 0 },
        title: "Volume trend",
        type
      } satisfies Pick<Extract<DashboardWidget, { type: "line" }>, "type" | "title" | "description" | "config" | "layout">;
    case "bar":
      return {
        config: { metricKeys: ["tickets_created", "hours_worked"], dimension: "client", stacked: false },
        description: "Top clients by volume and staffing.",
        layout: { h: 4, minH: 3, minW: 3, w: 8, x: 0, y: 0 },
        title: "Client mix",
        type
      } satisfies Pick<Extract<DashboardWidget, { type: "bar" }>, "type" | "title" | "description" | "config" | "layout">;
    case "table":
      return {
        config: {
          columns: ["name", "client", "tickets_created", "hours_worked", "avg_first_reply_minutes"],
          dataset: "agents",
          limit: 10,
          sort: { key: "tickets_created", direction: "desc" }
        },
        description: "Concise agent snapshot for the active window.",
        layout: { h: 4, minH: 3, minW: 3, w: 6, x: 0, y: 0 },
        title: "Agent table",
        type
      } satisfies Pick<Extract<DashboardWidget, { type: "table" }>, "type" | "title" | "description" | "config" | "layout">;
    case "kpi":
    default:
      return {
        config: { comparison: "previous_period", format: "number", metricKey: "tickets_created" },
        description: "Compact snapshot for the current window.",
        layout: { h: 3, minH: 2, minW: 2, w: 4, x: 0, y: 0 },
        title: "Tickets created",
        type: "kpi"
      } satisfies Pick<Extract<DashboardWidget, { type: "kpi" }>, "type" | "title" | "description" | "config" | "layout">;
  }
}

function buildWidget(widgetId: string, index: number, type: DashboardWidgetType): DashboardWidget {
  const template = getWidgetTemplate(type);

  return {
    ...template,
    id: widgetId,
    layout: { ...template.layout, y: index * 3 }
  } as DashboardWidget;
}

function getNextWidgetType(index: number): DashboardWidgetType {
  const widgetTypes: DashboardWidgetType[] = ["kpi", "line", "bar", "table"];
  return widgetTypes[index % widgetTypes.length] ?? "kpi";
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

async function loadTabData(tab: Pick<DashboardTab, "dateRange" | "hardFilters">) {
  const params = new URLSearchParams({
    start: tab.dateRange.start,
    end: tab.dateRange.end
  });
  if (tab.hardFilters.clientId !== "all") {
    params.set("client", tab.hardFilters.clientId);
  }
  const response = await fetch(`/api/dashboard-data?${params.toString()}`, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load dashboard data.");
  }

  return (await response.json()) as TabRuntimeData;
}

function BuilderCanvas({
  data,
  disabled,
  onAddWidget,
  onDeleteWidget,
  onMoveWidget,
  onResizeWidget,
  onSelectWidget,
  previousData,
  selectedWidgetId,
  tab
}: {
  data: DashboardData;
  disabled: boolean;
  onAddWidget: () => void;
  onDeleteWidget: (widgetId: string) => void;
  onMoveWidget: (widgetId: string, direction: LayoutDirection) => void;
  onResizeWidget: (widgetId: string, dimension: LayoutDimension, delta: number) => void;
  onSelectWidget: (widgetId: string) => void;
  previousData?: DashboardData | null;
  selectedWidgetId: string;
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
              Saved widgets render with live dashboard data here. Add cards, then move and resize them into a working dashboard layout.
            </CardDescription>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={disabled}
            onClick={onAddWidget}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add widget
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
            <p className="mt-4 text-sm font-medium">Real widget cards</p>
            <p className="mt-1 text-sm text-muted-foreground">KPI, line, bar, and table widgets render from saved config.</p>
          </div>
          <div className="rounded-3xl border border-dashed border-border/70 bg-muted/35 p-5">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">Layout controls included</p>
            <p className="mt-1 text-sm text-muted-foreground">Use the canvas controls or inspector to move widgets and resize them on the grid.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-dashed border-border/70 bg-muted/20 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Arrange widgets on a 12-column canvas. Selected cards expose move and resize controls.
          </p>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={disabled}
            onClick={onAddWidget}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add widget
          </button>
        </div>
      </div>
      <div className="overflow-x-auto pb-2">
        <div
          className="grid min-w-[960px] gap-4"
          style={{
            gridAutoRows: `${DASHBOARD_GRID_ROW_HEIGHT}px`,
            gridTemplateColumns: `repeat(${DASHBOARD_GRID_COLUMNS}, minmax(0, 1fr))`
          }}
        >
          {tab.widgets.map((widget) => (
            <div
              key={widget.id}
              style={{
                gridColumn: `${widget.layout.x + 1} / span ${widget.layout.w}`,
                gridRow: `${widget.layout.y + 1} / span ${widget.layout.h}`
              }}
            >
              <DashboardBuilderWidgetCard
                data={data}
                disabled={disabled}
                isSelected={widget.id === selectedWidgetId}
                onDelete={() => onDeleteWidget(widget.id)}
                onMove={(direction) => onMoveWidget(widget.id, direction)}
                onResize={(dimension, delta) => onResizeWidget(widget.id, dimension, delta)}
                onSelect={() => onSelectWidget(widget.id)}
                previousData={previousData}
                widget={widget}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardBuilderShell({
  availableClients,
  initialTabData,
  initialTabId,
  initialRecord,
}: {
  availableClients: BuilderClientOption[];
  initialTabData: TabRuntimeData;
  initialTabId: string;
  initialRecord: DashboardBuilderConfigRecord;
}) {
  const [record, setRecord] = useState(initialRecord);
  const [activeTabId, setActiveTabId] = useState(initialRecord.config.tabs[0]?.id ?? "");
  const [selectedWidgetId, setSelectedWidgetId] = useState(initialRecord.config.tabs[0]?.widgets[0]?.id ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [tabDataById, setTabDataById] = useState<Record<string, { key: string; value: TabRuntimeData }>>(() => ({
    [initialTabId]: {
      key:
        getTabDataKey(
          initialRecord.config.tabs.find((tab) => tab.id === initialTabId) ?? {
            dateRange: buildDefaultTabDateRange(),
            hardFilters: { clientId: "all" }
          }
        ),
      value: initialTabData
    }
  }));
  const [isDataPending, setIsDataPending] = useState(false);
  const [isPending, startTransition] = useTransition();
  const refreshedTabKeysRef = useRef(new Set<string>());

  const activeTab = record.config.tabs.find((tab) => tab.id === activeTabId) ?? record.config.tabs[0];
  const selectedWidget = activeTab?.widgets.find((widget) => widget.id === selectedWidgetId) ?? activeTab?.widgets[0] ?? null;
  const activeTabDataEntry = activeTab ? tabDataById[activeTab.id] : null;
  const activeTabDataKey = activeTab ? getTabDataKey(activeTab) : null;
  const activeTabData =
    activeTabDataEntry && activeTabDataKey && activeTabDataEntry.key === activeTabDataKey ? activeTabDataEntry.value : null;

  function invalidateTabData(tabId: string) {
    setTabDataById((current) => {
      const nextEntries = { ...current };
      delete nextEntries[tabId];
      return nextEntries;
    });
    refreshedTabKeysRef.current = new Set(
      [...refreshedTabKeysRef.current].filter((entry) => !entry.startsWith(`${tabId}:`))
    );
  }

  function persistConfig(nextConfig: DashboardBuilderConfig, nextActiveTabId: string, nextSelectedWidgetId = selectedWidgetId) {
    setRecord((current) => ({ ...current, config: nextConfig }));
    setActiveTabId(nextActiveTabId);
    setSelectedWidgetId(nextSelectedWidgetId);
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

  useEffect(() => {
    if (!activeTab || !activeTabDataKey) {
      return;
    }

    const refreshKey = `${activeTab.id}:${activeTabDataKey}`;
    if (refreshedTabKeysRef.current.has(refreshKey)) {
      return;
    }

    let cancelled = false;
    setIsDataPending(true);
    setDataError(null);

    void loadTabData(activeTab)
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setTabDataById((current) => ({
          ...current,
          [activeTab.id]: {
            key: activeTabDataKey,
            value: payload
          }
        }));
        refreshedTabKeysRef.current.add(refreshKey);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setDataError(error instanceof Error ? error.message : "Failed to load dashboard data.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsDataPending(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, activeTabDataEntry, activeTabDataKey]);

  function handleAddTab() {
    const nextTab: DashboardTab = {
      description: null,
      dateRange: activeTab?.dateRange ?? buildDefaultTabDateRange(),
      hardFilters: activeTab?.hardFilters ?? { clientId: "all" },
      id: buildTabId(),
      title: buildTabTitle(record.config.tabs),
      widgets: []
    };

    persistConfig(
      {
        ...record.config,
        tabs: [...record.config.tabs, nextTab]
      },
      nextTab.id,
      ""
    );
  }

  function handleUpdateTabDateRange(tabId: string, nextDateRange: DashboardTabDateRange) {
    const normalizedDateRange = normalizeDateRange(nextDateRange);

    const nextConfig = {
      ...record.config,
      tabs: record.config.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              dateRange: normalizedDateRange
            }
          : tab
      )
    } satisfies DashboardBuilderConfig;

    invalidateTabData(tabId);
    persistConfig(nextConfig, tabId, tabId === activeTab?.id ? selectedWidget?.id ?? "" : selectedWidgetId);
  }

  function handleUpdateTabHardFilters(tabId: string, nextHardFilters: DashboardTabHardFilters) {
    const nextConfig = {
      ...record.config,
      tabs: record.config.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              hardFilters: nextHardFilters
            }
          : tab
      )
    } satisfies DashboardBuilderConfig;

    invalidateTabData(tabId);
    persistConfig(nextConfig, tabId, tabId === activeTab?.id ? selectedWidget?.id ?? "" : selectedWidgetId);
  }

  function updateWidget(widgetId: string, updater: (widget: DashboardWidget) => DashboardWidget) {
    if (!activeTab) {
      return;
    }

    const nextConfig = {
      ...record.config,
      tabs: record.config.tabs.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              widgets: tab.widgets.map((widget) => (widget.id === widgetId ? updater(widget) : widget))
            }
          : tab
      )
    } satisfies DashboardBuilderConfig;

    persistConfig(nextConfig, activeTab.id, widgetId);
  }

  function updateActiveTabWidgets(
    updater: (widgets: DashboardWidget[]) => DashboardWidget[],
    nextSelectedWidgetId = selectedWidgetId
  ) {
    if (!activeTab) {
      return;
    }

    const nextConfig = {
      ...record.config,
      tabs: record.config.tabs.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              widgets: packWidgets(updater(tab.widgets))
            }
          : tab
      )
    } satisfies DashboardBuilderConfig;

    persistConfig(nextConfig, activeTab.id, nextSelectedWidgetId);
  }

  function handleChangeWidgetType(widgetId: string, nextType: DashboardWidgetType) {
    updateActiveTabWidgets(
      (widgets) =>
        widgets.map((widget, widgetIndex) => {
          if (widget.id !== widgetId || widget.type === nextType) {
            return widget;
          }

          const currentTemplate = getWidgetTemplate(widget.type);
          const nextTemplate = getWidgetTemplate(nextType);
          const nextWidget = buildWidget(widget.id, widgetIndex, nextType);

          return {
            ...nextWidget,
            description: widget.description === currentTemplate.description ? nextTemplate.description : widget.description,
            id: widget.id,
            layout: {
              ...nextWidget.layout,
              x: widget.layout.x,
              y: widget.layout.y
            },
            title: widget.title === currentTemplate.title ? nextTemplate.title : widget.title
          };
        }),
      widgetId
    );
  }

  function handleAddWidget() {
    if (!activeTab) {
      return;
    }

    const nextWidgetId = `${activeTab.id}-widget-${activeTab.widgets.length + 1}`;
    const nextWidget = buildWidget(nextWidgetId, activeTab.widgets.length, getNextWidgetType(activeTab.widgets.length));

    updateActiveTabWidgets((widgets) => [...widgets, nextWidget], nextWidgetId);
  }

  function handleDeleteWidget(widgetId: string) {
    if (!activeTab) {
      return;
    }

    const widgetIndex = activeTab.widgets.findIndex((widget) => widget.id === widgetId);
    if (widgetIndex === -1) {
      return;
    }

    const remainingWidgets = activeTab.widgets.filter((widget) => widget.id !== widgetId);
    const nextSelectedWidgetId =
      remainingWidgets[widgetIndex]?.id ?? remainingWidgets[widgetIndex - 1]?.id ?? remainingWidgets[0]?.id ?? "";

    updateActiveTabWidgets((widgets) => widgets.filter((widget) => widget.id !== widgetId), nextSelectedWidgetId);
  }

  function handleMoveWidget(widgetId: string, direction: LayoutDirection) {
    updateActiveTabWidgets(
      (widgets) =>
        widgets.map((widget) => {
          if (widget.id !== widgetId) {
            return widget;
          }

          switch (direction) {
            case "left":
              return { ...widget, layout: { ...widget.layout, x: Math.max(0, widget.layout.x - 1) } };
            case "right":
              return {
                ...widget,
                layout: {
                  ...widget.layout,
                  x: Math.min(DASHBOARD_GRID_COLUMNS - widget.layout.w, widget.layout.x + 1)
                }
              };
            case "up":
              return { ...widget, layout: { ...widget.layout, y: Math.max(0, widget.layout.y - 1) } };
            case "down":
              return { ...widget, layout: { ...widget.layout, y: widget.layout.y + 1 } };
            default:
              return widget;
          }
        }),
      widgetId
    );
  }

  function handleResizeWidget(widgetId: string, dimension: LayoutDimension, delta: number) {
    updateActiveTabWidgets(
      (widgets) =>
        widgets.map((widget) => {
          if (widget.id !== widgetId) {
            return widget;
          }

          if (dimension === "w") {
            const minWidth = widget.layout.minW ?? 2;
            const nextWidth = Math.max(minWidth, Math.min(DASHBOARD_GRID_COLUMNS, widget.layout.w + delta));

            return {
              ...widget,
              layout: {
                ...widget.layout,
                w: nextWidth,
                x: Math.min(widget.layout.x, DASHBOARD_GRID_COLUMNS - nextWidth)
              }
            };
          }

          const minHeight = widget.layout.minH ?? 2;

          return {
            ...widget,
            layout: {
              ...widget.layout,
              h: Math.max(minHeight, Math.min(12, widget.layout.h + delta))
            }
          };
        }),
      widgetId
    );
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
              Organize each tab on a live grid, then persist the layout through the existing builder config.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {isPending || isDataPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            <span>{isPending || isDataPending ? "Updating tab" : "Saved to your workspace"}</span>
          </div>
        </div>
      </section>

      <DashboardTabBar
        activeTab={activeTab ?? null}
        activeTabId={activeTab.id}
        clients={availableClients}
        disabled={isPending || isDataPending}
        onAddTab={handleAddTab}
        onUpdateHardFilters={handleUpdateTabHardFilters}
        onUpdateDateRange={handleUpdateTabDateRange}
        onSelectTab={(tabId) => {
          setActiveTabId(tabId);
          const nextTab = record.config.tabs.find((tab) => tab.id === tabId);
          setSelectedWidgetId(nextTab?.widgets[0]?.id ?? "");
        }}
        tabs={record.config.tabs}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="bg-background/95">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Canvas</p>
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle className="text-2xl">{activeTab.title}</CardTitle>
                <CardDescription className="mt-2">
                  {activeTab.description ?? "Saved widgets render directly in this builder canvas."}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
                  {activeTab.widgets.length === 1 ? "1 widget" : `${activeTab.widgets.length} widgets`}
                </Badge>
                <Badge className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-900">
                  Active window: {formatDateRangeLabel(activeTab.dateRange)}
                </Badge>
                <Badge className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-sky-900">
                  Hard client filter: {formatClientScopeLabel(activeTab.hardFilters.clientId, availableClients)}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activeTabData ? (
              <BuilderCanvas
                data={activeTabData.current}
                disabled={isPending || isDataPending}
                onAddWidget={handleAddWidget}
                onDeleteWidget={handleDeleteWidget}
                onMoveWidget={handleMoveWidget}
                onResizeWidget={handleResizeWidget}
                onSelectWidget={setSelectedWidgetId}
                previousData={activeTabData.previous}
                selectedWidgetId={selectedWidget?.id ?? ""}
                tab={activeTab}
              />
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-muted/20 p-6 text-center">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {isDataPending ? "Loading tab data" : "This tab has no data yet."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {dataError ?? "The active tab range will render here once the dashboard data finishes loading."}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <DashboardWidgetInspector
          disabled={isPending || isDataPending}
          onAddWidget={handleAddWidget}
          onChangeWidgetType={handleChangeWidgetType}
          onDeleteWidget={handleDeleteWidget}
          onMoveWidget={handleMoveWidget}
          onResizeWidget={handleResizeWidget}
          onSelectWidget={setSelectedWidgetId}
          onUpdateWidget={updateWidget}
          saveError={saveError}
          selectedWidget={selectedWidget}
          updatedAt={record.updatedAt}
          widgets={activeTab.widgets}
        />
      </section>
    </div>
  );
}
