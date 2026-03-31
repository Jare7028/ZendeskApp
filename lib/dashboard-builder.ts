import "server-only";

import { getCurrentUserContext } from "@/lib/auth/session";
import { type SortDirection, type TrendGranularity } from "@/lib/metrics/dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const DASHBOARD_BUILDER_VERSION = 1;
const DASHBOARD_GRID_COLUMNS = 12;

export const DASHBOARD_WIDGET_TYPES = ["kpi", "line", "bar", "table"] as const;
export type DashboardWidgetType = (typeof DASHBOARD_WIDGET_TYPES)[number];

export const DASHBOARD_BUILDER_METRIC_KEYS = [
  "tickets_created",
  "ticket_replies",
  "hours_worked",
  "interactions_per_hour_worked",
  "replies_per_hour_worked",
  "replies_per_ticket",
  "avg_first_reply_minutes",
  "avg_full_resolution_minutes",
  "median_first_reply_minutes",
  "median_full_resolution_minutes",
  "p90_first_reply_minutes",
  "p90_full_resolution_minutes",
  "agent_utilisation_ratio",
  "requester_wait_time_minutes",
  "reopens",
  "reopens_per_agent",
  "sla_first_reply_compliance",
  "sla_full_resolution_compliance"
] as const;
export type DashboardMetricKey = (typeof DASHBOARD_BUILDER_METRIC_KEYS)[number];

export const DASHBOARD_WIDGET_DATASETS = ["agents", "clients"] as const;
export type DashboardWidgetDataset = (typeof DASHBOARD_WIDGET_DATASETS)[number];

export const DASHBOARD_TABLE_COLUMN_KEYS = [
  "name",
  "client",
  "tickets_created",
  "ticket_replies",
  "hours_worked",
  "interactions_per_hour_worked",
  "replies_per_ticket",
  "avg_first_reply_minutes",
  "avg_full_resolution_minutes",
  "agent_utilisation_ratio",
  "sla_first_reply_compliance",
  "sla_full_resolution_compliance",
  "reopens"
] as const;
export type DashboardTableColumnKey = (typeof DASHBOARD_TABLE_COLUMN_KEYS)[number];

export type DashboardWidgetLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type DashboardWidgetBase = {
  id: string;
  title: string;
  description: string | null;
  type: DashboardWidgetType;
  layout: DashboardWidgetLayout;
};

export type DashboardKpiWidgetConfig = {
  metricKey: DashboardMetricKey;
  comparison: "none" | "previous_period";
  format: "number" | "percent" | "minutes";
};

export type DashboardLineWidgetConfig = {
  metricKeys: DashboardMetricKey[];
  granularity: TrendGranularity;
  stacked: boolean;
};

export type DashboardBarWidgetConfig = {
  metricKeys: DashboardMetricKey[];
  dimension: "client" | "agent" | "channel";
  stacked: boolean;
};

export type DashboardTableWidgetConfig = {
  dataset: DashboardWidgetDataset;
  columns: DashboardTableColumnKey[];
  limit: number;
  sort: {
    key: DashboardTableColumnKey;
    direction: SortDirection;
  };
};

export type DashboardWidget =
  | (DashboardWidgetBase & { type: "kpi"; config: DashboardKpiWidgetConfig })
  | (DashboardWidgetBase & { type: "line"; config: DashboardLineWidgetConfig })
  | (DashboardWidgetBase & { type: "bar"; config: DashboardBarWidgetConfig })
  | (DashboardWidgetBase & { type: "table"; config: DashboardTableWidgetConfig });

export type DashboardTab = {
  id: string;
  title: string;
  description: string | null;
  widgets: DashboardWidget[];
};

export type DashboardBuilderConfig = {
  version: typeof DASHBOARD_BUILDER_VERSION;
  tabs: DashboardTab[];
};

type DashboardBuilderConfigRow = {
  user_id: string;
  version: number;
  config: unknown;
  created_at: string;
  updated_at: string;
};

export type DashboardBuilderConfigRecord = {
  userId: string;
  version: number;
  config: DashboardBuilderConfig;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_KPI_CONFIG: DashboardKpiWidgetConfig = {
  metricKey: "tickets_created",
  comparison: "previous_period",
  format: "number"
};

const DEFAULT_LINE_CONFIG: DashboardLineWidgetConfig = {
  metricKeys: ["tickets_created", "hours_worked"],
  granularity: "daily",
  stacked: false
};

const DEFAULT_BAR_CONFIG: DashboardBarWidgetConfig = {
  metricKeys: ["tickets_created", "hours_worked"],
  dimension: "client",
  stacked: false
};

const DEFAULT_TABLE_CONFIG: DashboardTableWidgetConfig = {
  dataset: "agents",
  columns: ["name", "client", "tickets_created", "hours_worked", "avg_first_reply_minutes"],
  limit: 8,
  sort: { key: "tickets_created", direction: "desc" }
};

const SUPPORTED_LINE_METRICS: DashboardMetricKey[] = [
  "tickets_created",
  "hours_worked",
  "avg_first_reply_minutes",
  "avg_full_resolution_minutes"
];

const SUPPORTED_BAR_METRICS_BY_DIMENSION: Record<DashboardBarWidgetConfig["dimension"], DashboardMetricKey[]> = {
  agent: [
    "tickets_created",
    "hours_worked",
    "interactions_per_hour_worked",
    "avg_first_reply_minutes",
    "avg_full_resolution_minutes",
    "agent_utilisation_ratio",
    "reopens"
  ],
  channel: ["tickets_created"],
  client: [
    "tickets_created",
    "hours_worked",
    "interactions_per_hour_worked",
    "avg_first_reply_minutes",
    "avg_full_resolution_minutes",
    "agent_utilisation_ratio",
    "replies_per_ticket",
    "sla_first_reply_compliance",
    "sla_full_resolution_compliance"
  ]
};

const SUPPORTED_TABLE_COLUMNS_BY_DATASET: Record<DashboardWidgetDataset, DashboardTableColumnKey[]> = {
  agents: [
    "name",
    "client",
    "tickets_created",
    "hours_worked",
    "interactions_per_hour_worked",
    "avg_first_reply_minutes",
    "avg_full_resolution_minutes",
    "agent_utilisation_ratio",
    "reopens"
  ],
  clients: [
    "name",
    "tickets_created",
    "hours_worked",
    "interactions_per_hour_worked",
    "replies_per_ticket",
    "avg_first_reply_minutes",
    "avg_full_resolution_minutes",
    "agent_utilisation_ratio",
    "sla_first_reply_compliance",
    "sla_full_resolution_compliance"
  ]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNullableTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asInteger(value: unknown, fallback: number, options?: { min?: number; max?: number }) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  if (options?.min !== undefined && rounded < options.min) {
    return options.min;
  }
  if (options?.max !== undefined && rounded > options.max) {
    return options.max;
  }

  return rounded;
}

function asMetricKey(value: unknown, fallback: DashboardMetricKey): DashboardMetricKey {
  return typeof value === "string" && DASHBOARD_BUILDER_METRIC_KEYS.includes(value as DashboardMetricKey)
    ? (value as DashboardMetricKey)
    : fallback;
}

function asMetricKeys(value: unknown, fallback: DashboardMetricKey[]): DashboardMetricKey[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const keys = value.filter((entry): entry is DashboardMetricKey =>
    typeof entry === "string" && DASHBOARD_BUILDER_METRIC_KEYS.includes(entry as DashboardMetricKey)
  );

  return keys.length > 0 ? [...new Set(keys)] : fallback;
}

function asTableColumns(value: unknown, fallback: DashboardTableColumnKey[]): DashboardTableColumnKey[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const columns = value.filter((entry): entry is DashboardTableColumnKey =>
    typeof entry === "string" && DASHBOARD_TABLE_COLUMN_KEYS.includes(entry as DashboardTableColumnKey)
  );

  return columns.length > 0 ? [...new Set(columns)] : fallback;
}

function asSortDirection(value: unknown, fallback: SortDirection): SortDirection {
  return value === "asc" || value === "desc" ? value : fallback;
}

function asGranularity(value: unknown, fallback: TrendGranularity): TrendGranularity {
  return value === "daily" || value === "weekly" || value === "monthly" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asWidgetDataset(value: unknown, fallback: DashboardWidgetDataset): DashboardWidgetDataset {
  return typeof value === "string" && DASHBOARD_WIDGET_DATASETS.includes(value as DashboardWidgetDataset)
    ? (value as DashboardWidgetDataset)
    : fallback;
}

function asWidgetType(value: unknown, fallback: DashboardWidgetType): DashboardWidgetType {
  return typeof value === "string" && DASHBOARD_WIDGET_TYPES.includes(value as DashboardWidgetType)
    ? (value as DashboardWidgetType)
    : fallback;
}

function normalizeLayout(value: unknown): DashboardWidgetLayout {
  const layout = isRecord(value) ? value : {};
  const width = asInteger(layout.w, 3, { min: 2, max: DASHBOARD_GRID_COLUMNS });
  const x = asInteger(layout.x, 0, { min: 0, max: Math.max(0, DASHBOARD_GRID_COLUMNS - width) });

  return {
    x,
    y: asInteger(layout.y, 0, { min: 0 }),
    w: width,
    h: asInteger(layout.h, 3, { min: 2, max: 12 }),
    minW: asInteger(layout.minW, 2, { min: 1, max: DASHBOARD_GRID_COLUMNS }),
    minH: asInteger(layout.minH, 2, { min: 1, max: 12 })
  };
}

function normalizeKpiConfig(value: unknown): DashboardKpiWidgetConfig {
  const config = isRecord(value) ? value : {};

  return {
    metricKey: asMetricKey(config.metricKey, DEFAULT_KPI_CONFIG.metricKey),
    comparison: config.comparison === "none" || config.comparison === "previous_period" ? config.comparison : DEFAULT_KPI_CONFIG.comparison,
    format:
      config.format === "percent" || config.format === "minutes" || config.format === "number"
        ? config.format
        : DEFAULT_KPI_CONFIG.format
  };
}

function normalizeLineConfig(value: unknown): DashboardLineWidgetConfig {
  const config = isRecord(value) ? value : {};
  const metricKeys = asMetricKeys(config.metricKeys, DEFAULT_LINE_CONFIG.metricKeys).filter((metricKey) =>
    SUPPORTED_LINE_METRICS.includes(metricKey)
  );

  return {
    metricKeys: metricKeys.length > 0 ? metricKeys : DEFAULT_LINE_CONFIG.metricKeys,
    granularity: asGranularity(config.granularity, DEFAULT_LINE_CONFIG.granularity),
    stacked: asBoolean(config.stacked, DEFAULT_LINE_CONFIG.stacked)
  };
}

function normalizeBarConfig(value: unknown): DashboardBarWidgetConfig {
  const config = isRecord(value) ? value : {};
  const dimension =
    config.dimension === "client" || config.dimension === "agent" || config.dimension === "channel"
      ? config.dimension
      : DEFAULT_BAR_CONFIG.dimension;
  const metricKeys = asMetricKeys(config.metricKeys, DEFAULT_BAR_CONFIG.metricKeys).filter((metricKey) =>
    SUPPORTED_BAR_METRICS_BY_DIMENSION[dimension].includes(metricKey)
  );

  return {
    metricKeys: metricKeys.length > 0 ? metricKeys : SUPPORTED_BAR_METRICS_BY_DIMENSION[dimension].slice(0, 2),
    dimension,
    stacked: asBoolean(config.stacked, DEFAULT_BAR_CONFIG.stacked)
  };
}

function normalizeTableConfig(value: unknown): DashboardTableWidgetConfig {
  const config = isRecord(value) ? value : {};
  const sort = isRecord(config.sort) ? config.sort : {};
  const dataset = asWidgetDataset(config.dataset, DEFAULT_TABLE_CONFIG.dataset);
  const supportedColumns = SUPPORTED_TABLE_COLUMNS_BY_DATASET[dataset];
  const columns = asTableColumns(config.columns, DEFAULT_TABLE_CONFIG.columns).filter((column) => supportedColumns.includes(column));
  const sortKey =
    typeof sort.key === "string" && supportedColumns.includes(sort.key as DashboardTableColumnKey)
      ? (sort.key as DashboardTableColumnKey)
      : supportedColumns.includes(DEFAULT_TABLE_CONFIG.sort.key)
        ? DEFAULT_TABLE_CONFIG.sort.key
        : supportedColumns[0];

  return {
    dataset,
    columns: columns.length > 0 ? columns : supportedColumns.slice(0, 5),
    limit: asInteger(config.limit, DEFAULT_TABLE_CONFIG.limit, { min: 1, max: 100 }),
    sort: {
      key: sortKey,
      direction: asSortDirection(sort.direction, DEFAULT_TABLE_CONFIG.sort.direction)
    }
  };
}

function normalizeWidget(value: unknown, index: number): DashboardWidget {
  const widget = isRecord(value) ? value : {};
  const type = asWidgetType(widget.type, "kpi");
  const base = {
    id: asTrimmedString(widget.id, `widget-${index + 1}`),
    title: asTrimmedString(widget.title, "Untitled widget"),
    description: asNullableTrimmedString(widget.description),
    type,
    layout: normalizeLayout(widget.layout)
  } satisfies DashboardWidgetBase;

  switch (type) {
    case "line":
      return { ...base, type, config: normalizeLineConfig(widget.config) };
    case "bar":
      return { ...base, type, config: normalizeBarConfig(widget.config) };
    case "table":
      return { ...base, type, config: normalizeTableConfig(widget.config) };
    case "kpi":
    default:
      return { ...base, type: "kpi", config: normalizeKpiConfig(widget.config) };
  }
}

function normalizeTab(value: unknown, index: number): DashboardTab {
  const tab = isRecord(value) ? value : {};
  const widgetsValue = Array.isArray(tab.widgets) ? tab.widgets : [];
  const widgets = widgetsValue.map((widget, widgetIndex) => normalizeWidget(widget, widgetIndex));
  const occupied = new Set<string>();

  const placeWidget = (widget: DashboardWidget) => {
    const maxX = Math.max(0, DASHBOARD_GRID_COLUMNS - widget.layout.w);
    const nextWidget = {
      ...widget,
      layout: {
        ...widget.layout,
        x: Math.min(widget.layout.x, maxX)
      }
    };

    let y = Math.max(0, nextWidget.layout.y);

    while (true) {
      const collides = Array.from({ length: nextWidget.layout.w * nextWidget.layout.h }).some((_, cellIndex) => {
        const rowOffset = Math.floor(cellIndex / nextWidget.layout.w);
        const columnOffset = cellIndex % nextWidget.layout.w;
        return occupied.has(`${nextWidget.layout.x + columnOffset}:${y + rowOffset}`);
      });

      if (!collides) {
        break;
      }

      y += 1;
    }

    for (let rowOffset = 0; rowOffset < nextWidget.layout.h; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < nextWidget.layout.w; columnOffset += 1) {
        occupied.add(`${nextWidget.layout.x + columnOffset}:${y + rowOffset}`);
      }
    }

    return {
      ...nextWidget,
      layout: {
        ...nextWidget.layout,
        y
      }
    };
  };

  return {
    id: asTrimmedString(tab.id, `tab-${index + 1}`),
    title: asTrimmedString(tab.title, index === 0 ? "Overview" : `Tab ${index + 1}`),
    description: asNullableTrimmedString(tab.description),
    widgets: widgets
      .slice()
      .sort((left, right) => {
        if (left.layout.y !== right.layout.y) {
          return left.layout.y - right.layout.y;
        }
        if (left.layout.x !== right.layout.x) {
          return left.layout.x - right.layout.x;
        }
        return left.id.localeCompare(right.id, "en-GB");
      })
      .map(placeWidget)
  };
}

export function buildDefaultDashboardBuilderConfig(): DashboardBuilderConfig {
  return {
    version: DASHBOARD_BUILDER_VERSION,
    tabs: [
      {
        id: "overview",
        title: "Overview",
        description: "Starter layout for the current operational dashboard views.",
        widgets: [
          {
            id: "tickets-created",
            type: "kpi",
            title: "Tickets created",
            description: "Total tickets created in the selected window.",
            layout: { x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
            config: { metricKey: "tickets_created", comparison: "previous_period", format: "number" }
          },
          {
            id: "reply-workload",
            type: "kpi",
            title: "Reply workload per hour",
            description: "Reply count divided by matched hours.",
            layout: { x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
            config: { metricKey: "replies_per_hour_worked", comparison: "previous_period", format: "number" }
          },
          {
            id: "volume-trend",
            type: "line",
            title: "Volume trend",
            description: "Daily ticket creation trend.",
            layout: { x: 0, y: 2, w: 8, h: 4, minW: 4, minH: 3 },
            config: { metricKeys: ["tickets_created", "hours_worked"], granularity: "daily", stacked: false }
          },
          {
            id: "agent-table",
            type: "table",
            title: "Agent table",
            description: "Top agents in the current filter scope.",
            layout: { x: 8, y: 2, w: 4, h: 4, minW: 3, minH: 3 },
            config: {
              dataset: "agents",
              columns: ["name", "client", "tickets_created", "hours_worked", "avg_first_reply_minutes"],
              limit: 8,
              sort: { key: "tickets_created", direction: "desc" }
            }
          }
        ]
      }
    ]
  };
}

export function normalizeDashboardBuilderConfig(value: unknown): DashboardBuilderConfig {
  const config = isRecord(value) ? value : {};
  const tabsValue = Array.isArray(config.tabs) ? config.tabs : [];

  return {
    version: DASHBOARD_BUILDER_VERSION,
    tabs: tabsValue.length > 0 ? tabsValue.map((tab, index) => normalizeTab(tab, index)) : buildDefaultDashboardBuilderConfig().tabs
  };
}

function mapConfigRecord(row: DashboardBuilderConfigRow): DashboardBuilderConfigRecord {
  return {
    userId: row.user_id,
    version: row.version,
    config: normalizeDashboardBuilderConfig(row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function requireDashboardBuilderUser() {
  const context = await getCurrentUserContext();

  if (!context) {
    throw new Error("Unauthorized");
  }

  return context;
}

export async function loadDashboardBuilderConfig(): Promise<DashboardBuilderConfigRecord> {
  const context = await requireDashboardBuilderUser();
  const supabase = createServerSupabaseClient().schema("app");

  const { data, error } = await supabase
    .from("dashboard_builder_configs")
    .select("user_id,version,config,created_at,updated_at")
    .eq("user_id", context.userId)
    .maybeSingle()
    .returns<DashboardBuilderConfigRow | null>();

  if (error) {
    throw new Error(`Failed to load dashboard builder config: ${error.message}`);
  }

  if (data) {
    return mapConfigRecord(data);
  }

  return saveDashboardBuilderConfig(buildDefaultDashboardBuilderConfig());
}

export async function saveDashboardBuilderConfig(config: unknown): Promise<DashboardBuilderConfigRecord> {
  const context = await requireDashboardBuilderUser();
  const normalizedConfig = normalizeDashboardBuilderConfig(config);
  const supabase = createServerSupabaseClient().schema("app");

  const { data, error } = await supabase
    .from("dashboard_builder_configs")
    .upsert(
      {
        user_id: context.userId,
        version: DASHBOARD_BUILDER_VERSION,
        config: normalizedConfig
      },
      { onConflict: "user_id" }
    )
    .select("user_id,version,config,created_at,updated_at")
    .single()
    .returns<DashboardBuilderConfigRow>();

  if (error) {
    throw new Error(`Failed to save dashboard builder config: ${error.message}`);
  }

  return mapConfigRecord(data);
}
