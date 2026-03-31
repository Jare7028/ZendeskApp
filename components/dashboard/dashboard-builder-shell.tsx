"use client";

import { useState, useTransition } from "react";
import { LayoutGrid, LoaderCircle, PanelTop, Plus, Sparkles } from "lucide-react";

import { DashboardTabBar } from "@/components/dashboard/dashboard-tab-bar";
import { formatMinutes, formatNumber, formatPercent } from "@/components/dashboard/dashboard-format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type DashboardBuilderConfig,
  type DashboardBuilderConfigRecord,
  type DashboardMetricKey,
  type DashboardTab,
  type DashboardTableColumnKey,
  type DashboardWidget
} from "@/lib/dashboard-builder";
import { type DashboardData } from "@/lib/metrics/dashboard";

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

const METRIC_LABELS: Record<DashboardMetricKey, string> = {
  tickets_created: "Tickets created",
  ticket_replies: "Ticket replies",
  hours_worked: "Hours worked",
  interactions_per_hour_worked: "Tickets per hour",
  replies_per_hour_worked: "Replies per hour",
  replies_per_ticket: "Replies per ticket",
  avg_first_reply_minutes: "Avg first reply",
  avg_full_resolution_minutes: "Avg resolution",
  median_first_reply_minutes: "Median first reply",
  median_full_resolution_minutes: "Median resolution",
  p90_first_reply_minutes: "P90 first reply",
  p90_full_resolution_minutes: "P90 resolution",
  agent_utilisation_ratio: "Utilisation",
  requester_wait_time_minutes: "Requester wait",
  reopens: "Reopens",
  reopens_per_agent: "Reopens per agent",
  sla_first_reply_compliance: "First reply SLA",
  sla_full_resolution_compliance: "Resolution SLA"
};

const METRIC_FORMATS: Record<DashboardMetricKey, "number" | "percent" | "minutes"> = {
  tickets_created: "number",
  ticket_replies: "number",
  hours_worked: "number",
  interactions_per_hour_worked: "number",
  replies_per_hour_worked: "number",
  replies_per_ticket: "number",
  avg_first_reply_minutes: "minutes",
  avg_full_resolution_minutes: "minutes",
  median_first_reply_minutes: "minutes",
  median_full_resolution_minutes: "minutes",
  p90_first_reply_minutes: "minutes",
  p90_full_resolution_minutes: "minutes",
  agent_utilisation_ratio: "percent",
  requester_wait_time_minutes: "minutes",
  reopens: "number",
  reopens_per_agent: "number",
  sla_first_reply_compliance: "percent",
  sla_full_resolution_compliance: "percent"
};

const TABLE_COLUMN_LABELS: Record<DashboardTableColumnKey, string> = {
  name: "Name",
  client: "Client",
  tickets_created: "Tickets",
  ticket_replies: "Replies",
  hours_worked: "Hours",
  interactions_per_hour_worked: "Tickets/hr",
  replies_per_ticket: "Replies/ticket",
  avg_first_reply_minutes: "First reply",
  avg_full_resolution_minutes: "Resolution",
  agent_utilisation_ratio: "Utilisation",
  sla_first_reply_compliance: "First reply SLA",
  sla_full_resolution_compliance: "Resolution SLA",
  reopens: "Reopens"
};

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
          ticket_replies: null,
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

function DashboardBuilderWidgetCard({
  widget,
  data,
  previousData
}: {
  widget: DashboardWidget;
  data: DashboardData;
  previousData?: DashboardData | null;
}) {
  const builderData = buildBuilderDashboardData(data, previousData ?? null);

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
      <div className="flex h-full flex-col justify-between rounded-[28px] border border-border/60 bg-gradient-to-br from-background to-muted/30 p-5">
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
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{widget.description ?? "Current window"}</span>
          {delta ? <span className="font-medium text-foreground">{delta}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-[28px] border border-border/60 bg-background/95 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tracking-tight text-foreground">{widget.title}</p>
          {widget.description ? <p className="mt-1 text-sm text-muted-foreground">{widget.description}</p> : null}
        </div>
        <Badge className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
          {widget.type === "line" ? "Line" : widget.type === "bar" ? "Bar" : "Table"}
        </Badge>
      </div>
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

function getNextWidgetDefinition(index: number) {
  const nextType = index % 4;

  if (nextType === 0) {
    return {
      config: { comparison: "previous_period", format: "number", metricKey: "tickets_created" },
      description: "Compact snapshot for the current window.",
      title: "Tickets created",
      type: "kpi"
    } satisfies Pick<Extract<DashboardWidget, { type: "kpi" }>, "type" | "title" | "description" | "config">;
  }

  if (nextType === 1) {
    return {
      config: { metricKeys: ["tickets_created", "hours_worked"], granularity: "daily", stacked: false },
      description: "Ticket volume against matched hours.",
      title: "Volume trend",
      type: "line"
    } satisfies Pick<Extract<DashboardWidget, { type: "line" }>, "type" | "title" | "description" | "config">;
  }

  if (nextType === 2) {
    return {
      config: { metricKeys: ["tickets_created", "hours_worked"], dimension: "client", stacked: false },
      description: "Top clients by volume and staffing.",
      title: "Client mix",
      type: "bar"
    } satisfies Pick<Extract<DashboardWidget, { type: "bar" }>, "type" | "title" | "description" | "config">;
  }

  return {
    config: {
      columns: ["name", "client", "tickets_created", "hours_worked", "avg_first_reply_minutes"],
      dataset: "agents",
      limit: 6,
      sort: { key: "tickets_created", direction: "desc" }
    },
    description: "Concise agent snapshot for the active window.",
    title: "Agent table",
    type: "table"
  } satisfies Pick<Extract<DashboardWidget, { type: "table" }>, "type" | "title" | "description" | "config">;
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
  data,
  onAddWidget,
  previousData,
  tab
}: {
  data: DashboardData;
  onAddWidget: () => void;
  previousData?: DashboardData | null;
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
              Saved widgets render with live dashboard data here. Layout editing can stay for a later milestone.
            </CardDescription>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            <p className="mt-4 text-sm font-medium">Minimal by default</p>
            <p className="mt-1 text-sm text-muted-foreground">The builder keeps the lighter shell without the old dense report layout.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {tab.widgets.map((widget) => (
        <DashboardBuilderWidgetCard key={widget.id} data={data} previousData={previousData} widget={widget} />
      ))}
    </div>
  );
}

export function DashboardBuilderShell({
  initialDashboardData,
  initialRecord,
  previousDashboardData
}: {
  initialDashboardData: DashboardData;
  initialRecord: DashboardBuilderConfigRecord;
  previousDashboardData?: DashboardData | null;
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

    const nextWidget = getNextWidgetDefinition(activeTab.widgets.length);

    const nextConfig = {
      ...record.config,
      tabs: record.config.tabs.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              widgets: [
                ...tab.widgets,
                {
                  ...nextWidget,
                  id: `${tab.id}-widget-${tab.widgets.length + 1}`,
                  layout: { h: 3, minH: 2, minW: 2, w: 4, x: 0, y: tab.widgets.length * 3 },
                  ...(nextWidget.type === "line" || nextWidget.type === "bar"
                    ? { layout: { h: 4, minH: 3, minW: 3, w: 8, x: 0, y: tab.widgets.length * 3 } }
                    : {}),
                  ...(nextWidget.type === "table"
                    ? { layout: { h: 4, minH: 3, minW: 3, w: 6, x: 0, y: tab.widgets.length * 3 } }
                    : {})
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
                  {activeTab.description ?? "Saved widgets render directly in this builder canvas."}
                </CardDescription>
              </div>
              <Badge className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
                {activeTab.widgets.length === 1 ? "1 widget" : `${activeTab.widgets.length} widgets`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <BuilderCanvas
              data={initialDashboardData}
              onAddWidget={handleAddPlaceholderWidget}
              previousData={previousDashboardData}
              tab={activeTab}
            />
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
