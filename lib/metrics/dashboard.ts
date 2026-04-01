import "server-only";

import { recomputeComputedMetricsForDateRange } from "@/lib/metrics/compute";
import {
  ensureSlaAlertEvents,
  getSlaAlertFeed,
  type SlaAlertCandidate,
  type SlaAlertFeedItem
} from "@/lib/sla/alerts";
import { readSlaConfig, type SlaConfig } from "@/lib/sla/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVisibleClients } from "@/lib/zendesk/status";

type JsonObject = Record<string, unknown>;

export type DashboardView = "overview" | "agents" | "clients";
export type TrendGranularity = "daily" | "weekly" | "monthly";
export type SortDirection = "asc" | "desc";
export type AgentSortKey =
  | "name"
  | "client"
  | "totalInteractions"
  | "hoursWorked"
  | "interactionsPerHourWorked"
  | "avgFirstReplyMinutes"
  | "avgFullResolutionMinutes"
  | "reopens"
  | "utilisation";
export type ClientSortKey =
  | "client"
  | "totalInteractions"
  | "hoursWorked"
  | "interactionsPerHourWorked"
  | "avgFirstReplyMinutes"
  | "avgFullResolutionMinutes"
  | "utilisation"
  | "repliesPerTicket";

export type DashboardSearchParams = {
  client?: string;
  agent?: string;
  start?: string;
  end?: string;
  view?: string;
  granularity?: string;
  agentSort?: string;
  agentDir?: string;
  clientSort?: string;
  clientDir?: string;
};

type AgentOption = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  zendeskAgentId: string | null;
};

type ComputedMetricRow = {
  id?: string;
  client_id: string;
  metric_date: string;
  metric_key: string;
  dimension: Record<string, string | undefined> | null;
  metric_value: number;
};

type TicketRow = {
  id: string;
  client_id: string;
  zendesk_connection_id: string;
  agent_mapping_id: string | null;
  raw_payload: JsonObject | null;
};

type AgentMappingLookupRow = {
  id: string;
  client_id: string;
  zendesk_agent_id: string | null;
};

type TicketMetricRow = {
  ticket_id: string;
  first_response_minutes: number | null;
  full_resolution_minutes: number | null;
  payload: JsonObject | null;
};

type ZendeskConnectionRow = {
  id: string;
  client_id: string;
  name: string;
  status: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

type ServiceMetricWindowRow = {
  ticketId: string;
  clientId: string;
  zendeskConnectionId: string;
  agentMappingId: string | null;
  firstResponseMinutes: number | null;
  fullResolutionMinutes: number | null;
  payload: JsonObject | null;
};

export type DailyVolumePoint = {
  date: string;
  interactions: number;
  hoursWorked: number;
};

export type DailyResponsePoint = {
  date: string;
  avgFirstReplyMinutes: number | null;
  avgFullResolutionMinutes: number | null;
};

export type DailyChannelPoint = {
  date: string;
  email: number;
  chat: number;
  phone: number;
  other: number;
};

type ServiceStats = {
  avgFirstReplyMinutes: number | null;
  medianFirstReplyMinutes: number | null;
  p90FirstReplyMinutes: number | null;
  avgFullResolutionMinutes: number | null;
  medianFullResolutionMinutes: number | null;
  p90FullResolutionMinutes: number | null;
  requesterWaitTimeMinutes: number | null;
};

export type SlaStatusTone = "healthy" | "warning" | "breach" | "inactive" | "unconfigured";

export type SlaMetricCompliance = {
  targetMinutes: number | null;
  complianceRate: number | null;
  compliantCount: number;
  breachCount: number;
  measuredCount: number;
  thresholdPercent: number | null;
  status: SlaStatusTone;
};

export type SlaSummary = {
  connectionId: string | null;
  connectionName: string | null;
  thresholdPercent: number | null;
  alertsEnabled: boolean;
  firstReply: SlaMetricCompliance;
  fullResolution: SlaMetricCompliance;
  breached: boolean;
};

export type DashboardOverview = {
  totalInteractions: number;
  totalReplies: number;
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
};

export type AgentLeaderboardRow = {
  agentId: string;
  agentName: string;
  clientId: string;
  clientName: string;
  totalInteractions: number;
  totalReplies: number;
  totalHoursWorked: number;
  interactionsPerHourWorked: number | null;
  avgFirstReplyMinutes: number | null;
  avgFullResolutionMinutes: number | null;
  totalReopens: number;
  utilisation: number | null;
  sparkline: number[];
};

export type CapacityStatusTone = "balanced" | "warning" | "critical" | "muted";

export type ClientComparisonRow = {
  clientId: string;
  clientName: string;
  totalInteractions: number;
  totalHoursWorked: number;
  interactionsPerHourWorked: number | null;
  avgFirstReplyMinutes: number | null;
  avgFullResolutionMinutes: number | null;
  utilisation: number | null;
  repliesPerTicket: number | null;
  capacityLabel: string;
  capacityTone: CapacityStatusTone;
  capacityDetail: string;
  firstReplyComplianceRate: number | null;
  fullResolutionComplianceRate: number | null;
  slaStatus: SlaStatusTone;
};

type MetricSummary = {
  totalInteractions: number;
  totalHoursWorked: number;
  totalActivityHours: number;
  totalReplies: number;
  totalReopens: number;
  totalFirstReplyMinutes: number;
  ticketsWithFirstReply: number;
  totalFullResolutionMinutes: number;
  ticketsWithResolution: number;
  totalRequesterWaitMinutes: number;
  ticketsWithRequesterWait: number;
};

type DashboardScope = {
  filters: {
    startDate: string;
    endDate: string;
    clientId: string;
    agentId: string;
  };
  view: DashboardView;
  granularity: TrendGranularity;
  visibleClients: Array<{ id: string; name: string; slug: string }>;
  clientNameById: Map<string, string>;
  scopedClientIds: string[];
  agentOptions: AgentOption[];
  selectedAgent: AgentOption | null;
  agentSort: AgentSortKey;
  agentDir: SortDirection;
  clientSort: ClientSortKey;
  clientDir: SortDirection;
};

type ClientSlaConfig = {
  clientId: string;
  clientName: string;
  connectionId: string;
  connectionName: string;
  config: SlaConfig;
};

type ServiceAnalysis = {
  serviceStats: ServiceStats;
  overallSla: SlaSummary | null;
  byClientSla: Map<string, SlaSummary>;
  alertCandidates: SlaAlertCandidate[];
};

export type DashboardData = {
  filters: DashboardScope["filters"];
  view: DashboardView;
  granularity: TrendGranularity;
  visibleClients: DashboardScope["visibleClients"];
  agentOptions: AgentOption[];
  selectedAgent: AgentOption | null;
  hasVisibleClients: boolean;
  overview: DashboardOverview;
  sla: SlaSummary | null;
  alerts: SlaAlertFeedItem[];
  trends: {
    volume: DailyVolumePoint[];
    response: DailyResponsePoint[];
    channel: DailyChannelPoint[];
  };
  leaderboard: {
    rows: AgentLeaderboardRow[];
    sort: { key: AgentSortKey; direction: SortDirection };
  };
  clients: {
    rows: ClientComparisonRow[];
    sort: { key: ClientSortKey; direction: SortDirection };
    hardestClientId: string | null;
    easiestClientId: string | null;
  };
};

export type AgentDetailData = {
  filters: DashboardScope["filters"];
  granularity: TrendGranularity;
  visibleClients: DashboardScope["visibleClients"];
  agent: AgentOption;
  overview: DashboardOverview;
  sla: SlaSummary | null;
  trends: {
    volume: DailyVolumePoint[];
    response: DailyResponsePoint[];
  };
  peers: {
    rows: AgentLeaderboardRow[];
    sort: { key: AgentSortKey; direction: SortDirection };
    rank: number | null;
  };
  clientContext: ClientComparisonRow | null;
};

export type ClientDetailData = {
  filters: DashboardScope["filters"];
  granularity: TrendGranularity;
  visibleClients: DashboardScope["visibleClients"];
  client: { id: string; name: string; slug: string };
  overview: DashboardOverview;
  sla: SlaSummary | null;
  trends: {
    volume: DailyVolumePoint[];
    response: DailyResponsePoint[];
  };
  agents: {
    rows: AgentLeaderboardRow[];
    sort: { key: AgentSortKey; direction: SortDirection };
  };
  portfolioContext: ClientComparisonRow | null;
};

const AGENT_SORT_KEYS: AgentSortKey[] = [
  "name",
  "client",
  "totalInteractions",
  "hoursWorked",
  "interactionsPerHourWorked",
  "avgFirstReplyMinutes",
  "avgFullResolutionMinutes",
  "reopens",
  "utilisation"
];
const CLIENT_SORT_KEYS: ClientSortKey[] = [
  "client",
  "totalInteractions",
  "hoursWorked",
  "interactionsPerHourWorked",
  "avgFirstReplyMinutes",
  "avgFullResolutionMinutes",
  "utilisation",
  "repliesPerTicket"
];

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function clampDateRange(start: string | undefined, end: string | undefined) {
  const today = new Date();
  const defaultEnd = formatISODate(today);
  const defaultStart = formatISODate(addDays(today, -27));
  const startValue = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : defaultStart;
  const endValue = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : defaultEnd;

  if (startValue <= endValue) {
    return { startDate: startValue, endDate: endValue };
  }

  return { startDate: endValue, endDate: startValue };
}

function readPayloadNumber(payload: JsonObject | null, key: string) {
  const value = payload?.[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && typeof (value as JsonObject).calendar === "number") {
    return (value as JsonObject).calendar as number;
  }

  return null;
}

function percentile(values: number[], target: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = (sorted.length - 1) * target;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const weight = rank - lower;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseDashboardView(value: string | undefined): DashboardView {
  return value === "agents" || value === "clients" ? value : "overview";
}

function parseTrendGranularity(value: string | undefined): TrendGranularity {
  return value === "weekly" || value === "monthly" ? value : "daily";
}

function parseSortDirection(value: string | undefined, fallback: SortDirection): SortDirection {
  return value === "asc" || value === "desc" ? value : fallback;
}

function parseAgentSortKey(value: string | undefined): AgentSortKey {
  return AGENT_SORT_KEYS.includes(value as AgentSortKey) ? (value as AgentSortKey) : "totalInteractions";
}

function parseClientSortKey(value: string | undefined): ClientSortKey {
  return CLIENT_SORT_KEYS.includes(value as ClientSortKey) ? (value as ClientSortKey) : "totalInteractions";
}

async function getVisibleAgents(clientIds: string[]) {
  if (clientIds.length === 0) {
    return [] as AgentOption[];
  }

  const supabase = createServerSupabaseClient().schema("app");
  const [agentsResult, clientsResult] = await Promise.all([
    supabase
      .from("agent_mappings")
      .select("id,client_id,display_name,zendesk_agent_id")
      .in("client_id", clientIds)
      .eq("inclusion_status", "mapped")
      .not("zendesk_agent_id", "is", null)
      .order("display_name"),
    supabase.from("clients").select("id,name").in("id", clientIds)
  ]);

  if (agentsResult.error) {
    throw agentsResult.error;
  }

  if (clientsResult.error) {
    throw clientsResult.error;
  }

  const clientNameById = new Map(
    (clientsResult.data ?? []).map((client) => [client.id as string, client.name as string])
  );

  return ((agentsResult.data ?? []) as Array<{
    id: string;
    client_id: string;
    display_name: string;
    zendesk_agent_id: string | null;
  }>).map((agent) => ({
    id: agent.id,
    clientId: agent.client_id,
    clientName: clientNameById.get(agent.client_id) ?? "Unknown client",
    name: agent.display_name,
    zendeskAgentId: agent.zendesk_agent_id
  })) as AgentOption[];
}

async function getComputedMetricsRows(options: {
  clientIds: string[];
  startDate: string;
  endDate: string;
  scope: "client" | "agent" | "channel" | "agent_channel";
  agentId?: string | null;
}) {
  if (options.clientIds.length === 0) {
    return [] as ComputedMetricRow[];
  }

  const supabase = createServerSupabaseClient().schema("app");
  const pageSize = 1000;
  const rows: ComputedMetricRow[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("computed_metrics")
      .select("id,client_id,metric_date,metric_key,dimension,metric_value")
      .in("client_id", options.clientIds)
      .gte("metric_date", options.startDate)
      .lte("metric_date", options.endDate)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (options.agentId) {
      query = query.contains("dimension", {
        agentMappingId: options.agentId
      });
    } else {
      query = query.contains("dimension", { scope: options.scope });
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const batch = (data ?? []) as ComputedMetricRow[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function getClientSlaConfigs(clientIds: string[]) {
  if (clientIds.length === 0) {
    return new Map<string, ClientSlaConfig>();
  }

  const supabase = createServerSupabaseClient().schema("app");
  const { data, error } = await supabase
    .from("zendesk_connections")
    .select("id,client_id,name,status,updated_at,metadata")
    .in("client_id", clientIds)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const configsByClient = new Map<string, ClientSlaConfig>();

  for (const connection of (data ?? []) as ZendeskConnectionRow[]) {
    const config = readSlaConfig(connection.metadata);

    if (!config || configsByClient.has(connection.client_id)) {
      continue;
    }

    configsByClient.set(connection.client_id, {
      clientId: connection.client_id,
      clientName: "",
      connectionId: connection.id,
      connectionName: connection.name,
      config
    });
  }

  return configsByClient;
}

async function getServiceMetricWindowRows(options: {
  clientIds: string[];
  startDate: string;
  endDate: string;
  agentMappingId?: string | null;
}) {
  if (options.clientIds.length === 0) {
    return [] as ServiceMetricWindowRow[];
  }

  const supabase = createServerSupabaseClient().schema("app");
  const { data: tickets, error: ticketsError } = await supabase
    .from("tickets")
    .select("id,client_id,zendesk_connection_id,agent_mapping_id,raw_payload")
    .in("client_id", options.clientIds)
    .gte("created_at_source", `${options.startDate}T00:00:00.000Z`)
    .lte("created_at_source", `${options.endDate}T23:59:59.999Z`);

  if (ticketsError) {
    throw ticketsError;
  }

  const typedTickets = (tickets ?? []) as TicketRow[];

  if (typedTickets.length === 0) {
    return [];
  }

  const { data: agentMappings, error: agentMappingsError } = await supabase
    .from("agent_mappings")
    .select("id,client_id,zendesk_agent_id")
    .in("client_id", options.clientIds)
    .eq("inclusion_status", "mapped")
    .not("zendesk_agent_id", "is", null);

  if (agentMappingsError) {
    throw agentMappingsError;
  }

  const agentMappingByClientAndZendeskAgentId = new Map(
    ((agentMappings ?? []) as AgentMappingLookupRow[]).map((mapping) => [
      `${mapping.client_id}:${mapping.zendesk_agent_id}`,
      mapping.id
    ])
  );

  const ticketMetricRows: TicketMetricRow[] = [];
  const ticketIds = typedTickets.map((ticket) => ticket.id);

  for (let index = 0; index < ticketIds.length; index += 200) {
    const chunk = ticketIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("ticket_metrics")
      .select("ticket_id,first_response_minutes,full_resolution_minutes,payload")
      .in("ticket_id", chunk);

    if (error) {
      throw error;
    }

    ticketMetricRows.push(...((data ?? []) as TicketMetricRow[]));
  }

  const ticketById = new Map(typedTickets.map((ticket) => [ticket.id, ticket]));

  return ticketMetricRows
    .map((row) => {
      const ticket = ticketById.get(row.ticket_id);

      if (!ticket) {
        return null;
      }

      return {
        ticketId: row.ticket_id,
        clientId: ticket.client_id,
        zendeskConnectionId: ticket.zendesk_connection_id,
        agentMappingId:
          ticket.agent_mapping_id ??
          (() => {
            const assigneeId = ticket.raw_payload?.assignee_id;

            if (assigneeId === null || assigneeId === undefined) {
              return null;
            }

            return agentMappingByClientAndZendeskAgentId.get(`${ticket.client_id}:${String(assigneeId)}`) ?? null;
          })(),
        firstResponseMinutes: row.first_response_minutes,
        fullResolutionMinutes: row.full_resolution_minutes,
        payload: row.payload
      } satisfies ServiceMetricWindowRow;
    })
    .filter((row): row is ServiceMetricWindowRow => {
      if (!row) {
        return false;
      }

      if (options.agentMappingId) {
        return row.agentMappingId === options.agentMappingId;
      }

      return true;
    });
}

function buildEmptySlaMetric(status: SlaStatusTone = "unconfigured"): SlaMetricCompliance {
  return {
    targetMinutes: null,
    complianceRate: null,
    compliantCount: 0,
    breachCount: 0,
    measuredCount: 0,
    thresholdPercent: null,
    status
  };
}

function resolveSlaStatus(complianceRate: number | null, thresholdPercent: number | null, measuredCount: number) {
  if (thresholdPercent === null) {
    return "unconfigured" satisfies SlaStatusTone;
  }

  if (measuredCount === 0 || complianceRate === null) {
    return "inactive" satisfies SlaStatusTone;
  }

  if (complianceRate < thresholdPercent) {
    return "breach" satisfies SlaStatusTone;
  }

  if (complianceRate < thresholdPercent + 5) {
    return "warning" satisfies SlaStatusTone;
  }

  return "healthy" satisfies SlaStatusTone;
}

function buildSlaMetric(values: number[], targetMinutes: number | null, thresholdPercent: number | null) {
  if (targetMinutes === null || thresholdPercent === null) {
    return buildEmptySlaMetric();
  }

  const compliantCount = values.filter((value) => value <= targetMinutes).length;
  const measuredCount = values.length;
  const breachCount = Math.max(measuredCount - compliantCount, 0);
  const complianceRate = measuredCount > 0 ? (compliantCount / measuredCount) * 100 : null;

  return {
    targetMinutes,
    complianceRate,
    compliantCount,
    breachCount,
    measuredCount,
    thresholdPercent,
    status: resolveSlaStatus(complianceRate, thresholdPercent, measuredCount)
  } satisfies SlaMetricCompliance;
}

function resolveClientSlaStatus(summary: SlaSummary | undefined): SlaStatusTone {
  if (!summary) {
    return "unconfigured" satisfies SlaStatusTone;
  }

  if (summary.firstReply.status === "breach" || summary.fullResolution.status === "breach") {
    return "breach" satisfies SlaStatusTone;
  }

  if (summary.firstReply.status === "warning" || summary.fullResolution.status === "warning") {
    return "warning" satisfies SlaStatusTone;
  }

  if (summary.firstReply.status === "healthy" || summary.fullResolution.status === "healthy") {
    return "healthy" satisfies SlaStatusTone;
  }

  return "inactive" satisfies SlaStatusTone;
}

function buildSlaSummary(
  rows: ServiceMetricWindowRow[],
  configEntry: ClientSlaConfig | null,
  defaultStatus: SlaStatusTone = "unconfigured"
): SlaSummary | null {
  if (!configEntry) {
    return {
      connectionId: null,
      connectionName: null,
      thresholdPercent: null,
      alertsEnabled: false,
      firstReply: buildEmptySlaMetric(defaultStatus),
      fullResolution: buildEmptySlaMetric(defaultStatus),
      breached: false
    };
  }

  const firstReplyValues = rows
    .map((row) => row.firstResponseMinutes)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const fullResolutionValues = rows
    .map((row) => row.fullResolutionMinutes)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const firstReply = buildSlaMetric(
    firstReplyValues,
    configEntry.config.firstReplyTargetMinutes,
    configEntry.config.alertThresholdPercent
  );
  const fullResolution = buildSlaMetric(
    fullResolutionValues,
    configEntry.config.fullResolutionTargetMinutes,
    configEntry.config.alertThresholdPercent
  );

  return {
    connectionId: configEntry.connectionId,
    connectionName: configEntry.connectionName,
    thresholdPercent: configEntry.config.alertThresholdPercent,
    alertsEnabled: configEntry.config.alertsEnabled,
    firstReply,
    fullResolution,
    breached: firstReply.status === "breach" || fullResolution.status === "breach"
  };
}

function analyseServiceRows(
  rows: ServiceMetricWindowRow[],
  clientNameById: Map<string, string>,
  clientSlaConfigs: Map<string, ClientSlaConfig>,
  window: { startDate: string; endDate: string }
): ServiceAnalysis {
  const firstReplyValues = rows
    .map((row) => row.firstResponseMinutes)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const fullResolutionValues = rows
    .map((row) => row.fullResolutionMinutes)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const requesterWaitValues = rows
    .map((row) => readPayloadNumber(row.payload, "requester_wait_time_in_minutes"))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const serviceStats = {
    avgFirstReplyMinutes: average(firstReplyValues),
    medianFirstReplyMinutes: percentile(firstReplyValues, 0.5),
    p90FirstReplyMinutes: percentile(firstReplyValues, 0.9),
    avgFullResolutionMinutes: average(fullResolutionValues),
    medianFullResolutionMinutes: percentile(fullResolutionValues, 0.5),
    p90FullResolutionMinutes: percentile(fullResolutionValues, 0.9),
    requesterWaitTimeMinutes: average(requesterWaitValues)
  } satisfies ServiceStats;

  const rowsByClient = new Map<string, ServiceMetricWindowRow[]>();

  for (const row of rows) {
    const list = rowsByClient.get(row.clientId) ?? [];
    list.push(row);
    rowsByClient.set(row.clientId, list);
  }

  const byClientSla = new Map<string, SlaSummary>();
  const alertCandidates: SlaAlertCandidate[] = [];

  for (const [clientId, clientRows] of rowsByClient.entries()) {
    const configEntry = clientSlaConfigs.get(clientId) ?? null;
    const summary = buildSlaSummary(clientRows, configEntry, "inactive");

    if (!summary) {
      continue;
    }

    byClientSla.set(clientId, summary);

    if (configEntry) {
      const breachedMetrics = [
        ...(summary.firstReply.status === "breach" ? (["first_reply"] as const) : []),
        ...(summary.fullResolution.status === "breach" ? (["full_resolution"] as const) : [])
      ];

      alertCandidates.push({
        clientId,
        clientName: clientNameById.get(clientId) ?? "Unknown client",
        zendeskConnectionId: configEntry.connectionId,
        windowStart: window.startDate,
        windowEnd: window.endDate,
        config: configEntry.config,
        firstReplyCompliance: summary.firstReply.complianceRate,
        fullResolutionCompliance: summary.fullResolution.complianceRate,
        firstReplyMeasuredCount: summary.firstReply.measuredCount,
        fullResolutionMeasuredCount: summary.fullResolution.measuredCount,
        breachedMetrics
      });
    }
  }

  const configuredRows = rows.filter((row) => clientSlaConfigs.has(row.clientId));
  const aggregateThresholdPercent =
    configuredRows.length > 0
      ? average([...clientSlaConfigs.values()].map((entry) => entry.config.alertThresholdPercent))
      : null;
  const overallSla =
    aggregateThresholdPercent !== null
      ? ({
          connectionId: null,
          connectionName: null,
          thresholdPercent: aggregateThresholdPercent,
          alertsEnabled: [...clientSlaConfigs.values()].some((entry) => entry.config.alertsEnabled),
          firstReply: {
            ...buildEmptySlaMetric(),
            ...(() => {
              const values = configuredRows
                .map((row) => {
                  const config = clientSlaConfigs.get(row.clientId);
                  return (
                    !!config &&
                    row.firstResponseMinutes !== null &&
                    row.firstResponseMinutes <= config.config.firstReplyTargetMinutes
                  );
                })
                .filter((value): value is boolean => typeof value === "boolean");
              const measuredCount = values.length;
              const compliantCount = values.filter(Boolean).length;
              const complianceRate = measuredCount > 0 ? (compliantCount / measuredCount) * 100 : null;
              return {
                targetMinutes: null,
                complianceRate,
                compliantCount,
                breachCount: Math.max(measuredCount - compliantCount, 0),
                measuredCount,
                thresholdPercent: aggregateThresholdPercent,
                status: resolveSlaStatus(complianceRate, aggregateThresholdPercent, measuredCount) as SlaStatusTone
              };
            })()
          },
          fullResolution: {
            ...buildEmptySlaMetric(),
            ...(() => {
              const values = configuredRows
                .map((row) => {
                  const config = clientSlaConfigs.get(row.clientId);
                  return (
                    config &&
                    row.fullResolutionMinutes !== null &&
                    row.fullResolutionMinutes <= config.config.fullResolutionTargetMinutes
                  );
                })
                .filter((value): value is boolean => typeof value === "boolean");
              const measuredCount = values.length;
              const compliantCount = values.filter(Boolean).length;
              const complianceRate = measuredCount > 0 ? (compliantCount / measuredCount) * 100 : null;
              return {
                targetMinutes: null,
                complianceRate,
                compliantCount,
                breachCount: Math.max(measuredCount - compliantCount, 0),
                measuredCount,
                thresholdPercent: aggregateThresholdPercent,
                status: resolveSlaStatus(complianceRate, aggregateThresholdPercent, measuredCount) as SlaStatusTone
              };
            })()
          },
          breached: false as boolean
        } satisfies SlaSummary)
      : null;

  return {
    serviceStats,
    overallSla,
    byClientSla,
    alertCandidates
  };
}

function emptyServiceStats(): ServiceStats {
  return {
    avgFirstReplyMinutes: null,
    medianFirstReplyMinutes: null,
    p90FirstReplyMinutes: null,
    avgFullResolutionMinutes: null,
    medianFullResolutionMinutes: null,
    p90FullResolutionMinutes: null,
    requesterWaitTimeMinutes: null
  };
}

function emptyOverview(): DashboardOverview {
  return {
    totalInteractions: 0,
    totalReplies: 0,
    interactionsPerHourWorked: null,
    repliesPerHourWorked: null,
    agentUtilisationRatio: null,
    repliesPerTicket: null,
    reopensPerAgent: null,
    avgFirstReplyMinutes: null,
    medianFirstReplyMinutes: null,
    p90FirstReplyMinutes: null,
    avgFullResolutionMinutes: null,
    medianFullResolutionMinutes: null,
    p90FullResolutionMinutes: null,
    requesterWaitTimeMinutes: null
  };
}

function getMetricValue(rows: ComputedMetricRow[], metricKey: string) {
  return rows
    .filter((row) => row.metric_key === metricKey)
    .reduce((sum, row) => sum + Number(row.metric_value), 0);
}

function summarizeMetrics(rows: ComputedMetricRow[]): MetricSummary {
  return {
    totalInteractions: getMetricValue(rows, "total_interactions"),
    totalHoursWorked: getMetricValue(rows, "total_hours_worked"),
    totalActivityHours: getMetricValue(rows, "total_activity_hours"),
    totalReplies: getMetricValue(rows, "total_replies"),
    totalReopens: getMetricValue(rows, "total_reopens"),
    totalFirstReplyMinutes: getMetricValue(rows, "total_first_reply_minutes"),
    ticketsWithFirstReply: getMetricValue(rows, "tickets_with_first_reply"),
    totalFullResolutionMinutes: getMetricValue(rows, "total_full_resolution_minutes"),
    ticketsWithResolution: getMetricValue(rows, "tickets_with_resolution"),
    totalRequesterWaitMinutes: getMetricValue(rows, "total_requester_wait_minutes"),
    ticketsWithRequesterWait: getMetricValue(rows, "tickets_with_requester_wait")
  };
}

function buildOverview(rows: ComputedMetricRow[], serviceStats: ServiceStats, activeAgentCount: number) {
  const summary = summarizeMetrics(rows);

  return {
    totalInteractions: summary.totalInteractions,
    totalReplies: summary.totalReplies,
    interactionsPerHourWorked:
      summary.totalHoursWorked > 0 ? summary.totalInteractions / summary.totalHoursWorked : null,
    repliesPerHourWorked:
      summary.totalHoursWorked > 0 ? summary.totalReplies / summary.totalHoursWorked : null,
    agentUtilisationRatio:
      summary.totalHoursWorked > 0 ? summary.totalActivityHours / summary.totalHoursWorked : null,
    repliesPerTicket: summary.totalInteractions > 0 ? summary.totalReplies / summary.totalInteractions : null,
    reopensPerAgent: activeAgentCount > 0 ? summary.totalReopens / activeAgentCount : null,
    avgFirstReplyMinutes: serviceStats.avgFirstReplyMinutes,
    medianFirstReplyMinutes: serviceStats.medianFirstReplyMinutes,
    p90FirstReplyMinutes: serviceStats.p90FirstReplyMinutes,
    avgFullResolutionMinutes: serviceStats.avgFullResolutionMinutes,
    medianFullResolutionMinutes: serviceStats.medianFullResolutionMinutes,
    p90FullResolutionMinutes: serviceStats.p90FullResolutionMinutes,
    requesterWaitTimeMinutes:
      serviceStats.requesterWaitTimeMinutes ??
      (summary.ticketsWithRequesterWait > 0
        ? summary.totalRequesterWaitMinutes / summary.ticketsWithRequesterWait
        : null)
  } satisfies DashboardOverview;
}

function buildVolumeTrends(rows: ComputedMetricRow[]) {
  const byDate = new Map<string, DailyVolumePoint>();

  for (const row of rows) {
    const entry = byDate.get(row.metric_date) ?? {
      date: row.metric_date,
      interactions: 0,
      hoursWorked: 0
    };

    if (row.metric_key === "total_interactions") {
      entry.interactions += row.metric_value;
    }

    if (row.metric_key === "total_hours_worked") {
      entry.hoursWorked += row.metric_value;
    }

    byDate.set(row.metric_date, entry);
  }

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function buildResponseTrends(rows: ComputedMetricRow[]) {
  const byDate = new Map<
    string,
    {
      date: string;
      totalFirstReplyMinutes: number;
      ticketsWithFirstReply: number;
      totalFullResolutionMinutes: number;
      ticketsWithResolution: number;
    }
  >();

  for (const row of rows) {
    const entry = byDate.get(row.metric_date) ?? {
      date: row.metric_date,
      totalFirstReplyMinutes: 0,
      ticketsWithFirstReply: 0,
      totalFullResolutionMinutes: 0,
      ticketsWithResolution: 0
    };

    if (row.metric_key === "total_first_reply_minutes") {
      entry.totalFirstReplyMinutes += row.metric_value;
    }

    if (row.metric_key === "tickets_with_first_reply") {
      entry.ticketsWithFirstReply += row.metric_value;
    }

    if (row.metric_key === "total_full_resolution_minutes") {
      entry.totalFullResolutionMinutes += row.metric_value;
    }

    if (row.metric_key === "tickets_with_resolution") {
      entry.ticketsWithResolution += row.metric_value;
    }

    byDate.set(row.metric_date, entry);
  }

  return [...byDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(
      (entry) =>
        ({
          date: entry.date,
          avgFirstReplyMinutes:
            entry.ticketsWithFirstReply > 0
              ? entry.totalFirstReplyMinutes / entry.ticketsWithFirstReply
              : null,
          avgFullResolutionMinutes:
            entry.ticketsWithResolution > 0
              ? entry.totalFullResolutionMinutes / entry.ticketsWithResolution
              : null
        }) satisfies DailyResponsePoint
    );
}

function buildChannelTrends(rows: ComputedMetricRow[]) {
  const byDate = new Map<string, DailyChannelPoint>();

  for (const row of rows) {
    if (row.metric_key !== "total_interactions") {
      continue;
    }

    const channel = row.dimension?.channel ?? "other";
    const entry = byDate.get(row.metric_date) ?? {
      date: row.metric_date,
      email: 0,
      chat: 0,
      phone: 0,
      other: 0
    };

    if (channel === "email" || channel === "chat" || channel === "phone") {
      entry[channel] += row.metric_value;
    } else {
      entry.other += row.metric_value;
    }

    byDate.set(row.metric_date, entry);
  }

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function buildAgentLeaderboardRows(rows: ComputedMetricRow[], agentOptions: AgentOption[], clientNameById: Map<string, string>) {
  const optionByAgentId = new Map(agentOptions.map((agent) => [agent.id, agent]));
  const grouped = new Map<
    string,
    {
      agentId: string;
      agentName: string;
      clientId: string;
      clientName: string;
      metrics: MetricSummary;
      dates: Map<string, number>;
    }
  >();

  for (const row of rows) {
    const agentId = row.dimension?.agentMappingId;

    if (!agentId) {
      continue;
    }

    const option = optionByAgentId.get(agentId);
    const entry = grouped.get(agentId) ?? {
      agentId,
      agentName: row.dimension?.agentName ?? option?.name ?? "Unknown agent",
      clientId: row.client_id,
      clientName: option?.clientName ?? clientNameById.get(row.client_id) ?? "Unknown client",
      metrics: {
        totalInteractions: 0,
        totalHoursWorked: 0,
        totalActivityHours: 0,
        totalReplies: 0,
        totalReopens: 0,
        totalFirstReplyMinutes: 0,
        ticketsWithFirstReply: 0,
        totalFullResolutionMinutes: 0,
        ticketsWithResolution: 0,
        totalRequesterWaitMinutes: 0,
        ticketsWithRequesterWait: 0
      },
      dates: new Map<string, number>()
    };

    switch (row.metric_key) {
      case "total_interactions":
        entry.metrics.totalInteractions += row.metric_value;
        entry.dates.set(row.metric_date, (entry.dates.get(row.metric_date) ?? 0) + row.metric_value);
        break;
      case "total_hours_worked":
        entry.metrics.totalHoursWorked += row.metric_value;
        break;
      case "total_activity_hours":
        entry.metrics.totalActivityHours += row.metric_value;
        break;
      case "total_reopens":
        entry.metrics.totalReopens += row.metric_value;
        break;
      case "total_replies":
        entry.metrics.totalReplies += row.metric_value;
        break;
      case "total_first_reply_minutes":
        entry.metrics.totalFirstReplyMinutes += row.metric_value;
        break;
      case "tickets_with_first_reply":
        entry.metrics.ticketsWithFirstReply += row.metric_value;
        break;
      case "total_full_resolution_minutes":
        entry.metrics.totalFullResolutionMinutes += row.metric_value;
        break;
      case "tickets_with_resolution":
        entry.metrics.ticketsWithResolution += row.metric_value;
        break;
      case "total_requester_wait_minutes":
        entry.metrics.totalRequesterWaitMinutes += row.metric_value;
        break;
      case "tickets_with_requester_wait":
        entry.metrics.ticketsWithRequesterWait += row.metric_value;
        break;
      default:
        break;
    }

    grouped.set(agentId, entry);
  }

  return [...grouped.values()].map(
    (entry) =>
      ({
        agentId: entry.agentId,
        agentName: entry.agentName,
        clientId: entry.clientId,
        clientName: entry.clientName,
        totalInteractions: entry.metrics.totalInteractions,
        totalReplies: entry.metrics.totalReplies,
        totalHoursWorked: entry.metrics.totalHoursWorked,
        interactionsPerHourWorked:
          entry.metrics.totalHoursWorked > 0
            ? entry.metrics.totalInteractions / entry.metrics.totalHoursWorked
            : null,
        avgFirstReplyMinutes:
          entry.metrics.ticketsWithFirstReply > 0
            ? entry.metrics.totalFirstReplyMinutes / entry.metrics.ticketsWithFirstReply
            : null,
        avgFullResolutionMinutes:
          entry.metrics.ticketsWithResolution > 0
            ? entry.metrics.totalFullResolutionMinutes / entry.metrics.ticketsWithResolution
            : null,
        totalReopens: entry.metrics.totalReopens,
        utilisation:
          entry.metrics.totalHoursWorked > 0
            ? entry.metrics.totalActivityHours / entry.metrics.totalHoursWorked
            : null,
        sparkline: [...entry.dates.entries()]
          .sort((left, right) => left[0].localeCompare(right[0]))
          .map(([, value]) => value)
      }) satisfies AgentLeaderboardRow
  );
}

function median(values: number[]) {
  return percentile(values, 0.5);
}

function buildCapacityStatus(
  row: Pick<ClientComparisonRow, "totalHoursWorked" | "totalInteractions" | "interactionsPerHourWorked" | "utilisation">,
  throughputMedian: number | null
) {
  if (row.totalHoursWorked <= 0 && row.totalInteractions > 0) {
    return {
      capacityLabel: "Coverage gap",
      capacityTone: "critical",
      capacityDetail: "Tickets landed without matched hours in the selected window."
    } satisfies Pick<ClientComparisonRow, "capacityLabel" | "capacityTone" | "capacityDetail">;
  }

  if (row.totalHoursWorked <= 0) {
    return {
      capacityLabel: "No staffing data",
      capacityTone: "muted",
      capacityDetail: "No logged hours are available for this filter set."
    } satisfies Pick<ClientComparisonRow, "capacityLabel" | "capacityTone" | "capacityDetail">;
  }

  const throughputIsHigh =
    throughputMedian !== null &&
    row.interactionsPerHourWorked !== null &&
    row.interactionsPerHourWorked >= throughputMedian;
  const throughputIsLow =
    throughputMedian !== null &&
    row.interactionsPerHourWorked !== null &&
    row.interactionsPerHourWorked < throughputMedian;

  if ((row.utilisation ?? 0) >= 0.85 && throughputIsHigh) {
    return {
      capacityLabel: "Understaffed",
      capacityTone: "critical",
      capacityDetail: "High utilisation and above-median ticket-created load suggest stretched coverage."
    } satisfies Pick<ClientComparisonRow, "capacityLabel" | "capacityTone" | "capacityDetail">;
  }

  if ((row.utilisation ?? 0) <= 0.45 && throughputIsLow) {
    return {
      capacityLabel: "Overstaffed",
      capacityTone: "warning",
      capacityDetail: "Hours are outpacing ticket-created demand relative to the rest of the portfolio."
    } satisfies Pick<ClientComparisonRow, "capacityLabel" | "capacityTone" | "capacityDetail">;
  }

  if ((row.utilisation ?? 0) >= 0.75) {
    return {
      capacityLabel: "Watch load",
      capacityTone: "warning",
      capacityDetail: "This client is running hot even if throughput remains in range."
    } satisfies Pick<ClientComparisonRow, "capacityLabel" | "capacityTone" | "capacityDetail">;
  }

  return {
    capacityLabel: "Balanced",
    capacityTone: "balanced",
    capacityDetail: "Hours worked and tickets created are moving in line for the current window."
  } satisfies Pick<ClientComparisonRow, "capacityLabel" | "capacityTone" | "capacityDetail">;
}

function buildClientComparisonRows(
  rows: ComputedMetricRow[],
  clientNameById: Map<string, string>,
  slaByClient: Map<string, SlaSummary>
) {
  const grouped = new Map<string, MetricSummary>();

  for (const row of rows) {
    const entry = grouped.get(row.client_id) ?? {
      totalInteractions: 0,
      totalHoursWorked: 0,
      totalActivityHours: 0,
      totalReplies: 0,
      totalReopens: 0,
      totalFirstReplyMinutes: 0,
      ticketsWithFirstReply: 0,
      totalFullResolutionMinutes: 0,
      ticketsWithResolution: 0,
      totalRequesterWaitMinutes: 0,
      ticketsWithRequesterWait: 0
    };

    switch (row.metric_key) {
      case "total_interactions":
        entry.totalInteractions += row.metric_value;
        break;
      case "total_hours_worked":
        entry.totalHoursWorked += row.metric_value;
        break;
      case "total_activity_hours":
        entry.totalActivityHours += row.metric_value;
        break;
      case "total_replies":
        entry.totalReplies += row.metric_value;
        break;
      case "total_reopens":
        entry.totalReopens += row.metric_value;
        break;
      case "total_first_reply_minutes":
        entry.totalFirstReplyMinutes += row.metric_value;
        break;
      case "tickets_with_first_reply":
        entry.ticketsWithFirstReply += row.metric_value;
        break;
      case "total_full_resolution_minutes":
        entry.totalFullResolutionMinutes += row.metric_value;
        break;
      case "tickets_with_resolution":
        entry.ticketsWithResolution += row.metric_value;
        break;
      case "total_requester_wait_minutes":
        entry.totalRequesterWaitMinutes += row.metric_value;
        break;
      case "tickets_with_requester_wait":
        entry.ticketsWithRequesterWait += row.metric_value;
        break;
      default:
        break;
    }

    grouped.set(row.client_id, entry);
  }

  const baseRows: Array<Omit<ClientComparisonRow, "capacityLabel" | "capacityTone" | "capacityDetail">> =
    [...grouped.entries()].map(([clientId, metrics]) => ({
      clientId,
      clientName: clientNameById.get(clientId) ?? "Unknown client",
      totalInteractions: metrics.totalInteractions,
      totalHoursWorked: metrics.totalHoursWorked,
      interactionsPerHourWorked:
        metrics.totalHoursWorked > 0 ? metrics.totalInteractions / metrics.totalHoursWorked : null,
      avgFirstReplyMinutes:
        metrics.ticketsWithFirstReply > 0 ? metrics.totalFirstReplyMinutes / metrics.ticketsWithFirstReply : null,
      avgFullResolutionMinutes:
        metrics.ticketsWithResolution > 0 ? metrics.totalFullResolutionMinutes / metrics.ticketsWithResolution : null,
      utilisation: metrics.totalHoursWorked > 0 ? metrics.totalActivityHours / metrics.totalHoursWorked : null,
      repliesPerTicket: metrics.totalInteractions > 0 ? metrics.totalReplies / metrics.totalInteractions : null,
      firstReplyComplianceRate: slaByClient.get(clientId)?.firstReply.complianceRate ?? null,
      fullResolutionComplianceRate: slaByClient.get(clientId)?.fullResolution.complianceRate ?? null,
      slaStatus: resolveClientSlaStatus(slaByClient.get(clientId))
    }));

  const throughputMedian = median(
    baseRows
      .map((row) => row.interactionsPerHourWorked)
      .filter((value): value is number => value !== null && Number.isFinite(value))
  );

  return baseRows.map(
    (row) =>
      ({
        ...row,
        ...buildCapacityStatus(row, throughputMedian)
      }) satisfies ClientComparisonRow
  );
}

function normaliseScore(value: number | null, min: number, max: number, invert = false) {
  if (value === null || max <= min) {
    return 0;
  }

  const score = (value - min) / (max - min);
  return invert ? 1 - score : score;
}

function rankClientDifficulty(rows: ClientComparisonRow[]) {
  if (rows.length < 2) {
    return { hardestClientId: null, easiestClientId: null };
  }

  const firstReplyValues = rows
    .map((row) => row.avgFirstReplyMinutes)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const resolutionValues = rows
    .map((row) => row.avgFullResolutionMinutes)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const throughputValues = rows
    .map((row) => row.interactionsPerHourWorked)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const minFirstReply = Math.min(...firstReplyValues, 0);
  const maxFirstReply = Math.max(...firstReplyValues, 1);
  const minResolution = Math.min(...resolutionValues, 0);
  const maxResolution = Math.max(...resolutionValues, 1);
  const minThroughput = Math.min(...throughputValues, 0);
  const maxThroughput = Math.max(...throughputValues, 1);

  const scoredRows = rows.map((row) => ({
    clientId: row.clientId,
    score:
      normaliseScore(row.avgFirstReplyMinutes, minFirstReply, maxFirstReply) +
      normaliseScore(row.avgFullResolutionMinutes, minResolution, maxResolution) +
      normaliseScore(row.interactionsPerHourWorked, minThroughput, maxThroughput, true)
  }));
  const hardest = [...scoredRows].sort((left, right) => right.score - left.score)[0];
  const easiest = [...scoredRows].sort((left, right) => left.score - right.score)[0];

  return {
    hardestClientId: hardest?.clientId ?? null,
    easiestClientId: easiest?.clientId ?? null
  };
}

function compareNullableNumbers(left: number | null, right: number | null, direction: SortDirection) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
}

function sortAgentRows(rows: AgentLeaderboardRow[], sortKey: AgentSortKey, direction: SortDirection) {
  return [...rows].sort((left, right) => {
    switch (sortKey) {
      case "name":
        return direction === "asc"
          ? left.agentName.localeCompare(right.agentName)
          : right.agentName.localeCompare(left.agentName);
      case "client":
        return direction === "asc"
          ? left.clientName.localeCompare(right.clientName)
          : right.clientName.localeCompare(left.clientName);
      case "hoursWorked":
        return direction === "asc"
          ? left.totalHoursWorked - right.totalHoursWorked
          : right.totalHoursWorked - left.totalHoursWorked;
      case "interactionsPerHourWorked":
        return compareNullableNumbers(left.interactionsPerHourWorked, right.interactionsPerHourWorked, direction);
      case "avgFirstReplyMinutes":
        return compareNullableNumbers(left.avgFirstReplyMinutes, right.avgFirstReplyMinutes, direction);
      case "avgFullResolutionMinutes":
        return compareNullableNumbers(left.avgFullResolutionMinutes, right.avgFullResolutionMinutes, direction);
      case "reopens":
        return direction === "asc"
          ? left.totalReopens - right.totalReopens
          : right.totalReopens - left.totalReopens;
      case "utilisation":
        return compareNullableNumbers(left.utilisation, right.utilisation, direction);
      case "totalInteractions":
      default:
        return direction === "asc"
          ? left.totalInteractions - right.totalInteractions
          : right.totalInteractions - left.totalInteractions;
    }
  });
}

function sortClientRows(rows: ClientComparisonRow[], sortKey: ClientSortKey, direction: SortDirection) {
  return [...rows].sort((left, right) => {
    switch (sortKey) {
      case "client":
        return direction === "asc"
          ? left.clientName.localeCompare(right.clientName)
          : right.clientName.localeCompare(left.clientName);
      case "hoursWorked":
        return direction === "asc"
          ? left.totalHoursWorked - right.totalHoursWorked
          : right.totalHoursWorked - left.totalHoursWorked;
      case "interactionsPerHourWorked":
        return compareNullableNumbers(left.interactionsPerHourWorked, right.interactionsPerHourWorked, direction);
      case "avgFirstReplyMinutes":
        return compareNullableNumbers(left.avgFirstReplyMinutes, right.avgFirstReplyMinutes, direction);
      case "avgFullResolutionMinutes":
        return compareNullableNumbers(left.avgFullResolutionMinutes, right.avgFullResolutionMinutes, direction);
      case "utilisation":
        return compareNullableNumbers(left.utilisation, right.utilisation, direction);
      case "repliesPerTicket":
        return compareNullableNumbers(left.repliesPerTicket, right.repliesPerTicket, direction);
      case "totalInteractions":
      default:
        return direction === "asc"
          ? left.totalInteractions - right.totalInteractions
          : right.totalInteractions - left.totalInteractions;
    }
  });
}

function getPeriodStart(date: string, granularity: TrendGranularity) {
  if (granularity === "daily") {
    return date;
  }

  const value = new Date(`${date}T00:00:00.000Z`);

  if (granularity === "monthly") {
    value.setUTCDate(1);
    return formatISODate(value);
  }

  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  return formatISODate(value);
}

function aggregateMetricRows(rows: ComputedMetricRow[], granularity: TrendGranularity) {
  if (granularity === "daily") {
    return rows;
  }

  const grouped = new Map<string, ComputedMetricRow>();

  for (const row of rows) {
    const metricDate = getPeriodStart(row.metric_date, granularity);
    const dimension = row.dimension ?? null;
    const dimensionKey = dimension ? JSON.stringify(dimension) : "null";
    const key = [row.client_id, metricDate, row.metric_key, dimensionKey].join("|");
    const existing = grouped.get(key);

    if (existing) {
      existing.metric_value += row.metric_value;
      continue;
    }

    grouped.set(key, {
      client_id: row.client_id,
      metric_date: metricDate,
      metric_key: row.metric_key,
      dimension,
      metric_value: row.metric_value
    });
  }

  return [...grouped.values()];
}

function buildTrendSet(rows: ComputedMetricRow[], granularity: TrendGranularity) {
  const aggregatedRows = aggregateMetricRows(rows, granularity);

  return {
    volume: buildVolumeTrends(aggregatedRows),
    response: buildResponseTrends(aggregatedRows)
  };
}

export async function ensureDashboardMetrics(clientIds: string[], startDate: string, endDate: string) {
  if (clientIds.length > 0) {
    await recomputeComputedMetricsForDateRange({
      clientIds,
      startDate,
      endDate
    });
  }
}

export async function resolveDashboardScope(searchParams: DashboardSearchParams = {}): Promise<DashboardScope> {
  const visibleClients = await getVisibleClients();
  const { startDate, endDate } = clampDateRange(searchParams.start, searchParams.end);
  const view = parseDashboardView(searchParams.view);
  const granularity = parseTrendGranularity(searchParams.granularity);
  const agentSort = parseAgentSortKey(searchParams.agentSort);
  const agentDir = parseSortDirection(searchParams.agentDir, "desc");
  const clientSort = parseClientSortKey(searchParams.clientSort);
  const clientDir = parseSortDirection(searchParams.clientDir, "desc");
  const clientNameById = new Map(visibleClients.map((client) => [client.id, client.name]));

  const selectedClientId =
    searchParams.client && visibleClients.some((client) => client.id === searchParams.client)
      ? searchParams.client
      : "all";
  const scopedClientIds =
    selectedClientId === "all" ? visibleClients.map((client) => client.id) : [selectedClientId];
  const agentOptions = await getVisibleAgents(scopedClientIds);
  const selectedAgent =
    searchParams.agent && agentOptions.some((agent) => agent.id === searchParams.agent)
      ? agentOptions.find((agent) => agent.id === searchParams.agent) ?? null
      : null;

  return {
    filters: {
      startDate,
      endDate,
      clientId: selectedClientId,
      agentId: selectedAgent?.id ?? "all"
    },
    view,
    granularity,
    visibleClients,
    clientNameById,
    scopedClientIds,
    agentOptions,
    selectedAgent,
    agentSort,
    agentDir,
    clientSort,
    clientDir
  };
}

export async function getDashboardData(
  searchParams: DashboardSearchParams = {},
  options: { includeAdminAlerts?: boolean; skipEnsureMetrics?: boolean } = {}
): Promise<DashboardData> {
  const scope = await resolveDashboardScope(searchParams);

  if (scope.visibleClients.length === 0) {
    return {
      filters: scope.filters,
      view: scope.view,
      granularity: scope.granularity,
      visibleClients: scope.visibleClients,
      agentOptions: [],
      selectedAgent: null,
      hasVisibleClients: false,
      overview: emptyOverview(),
      sla: null,
      alerts: [],
      trends: {
        volume: [],
        response: [],
        channel: []
      },
      leaderboard: {
        rows: [],
        sort: { key: scope.agentSort, direction: scope.agentDir }
      },
      clients: {
        rows: [],
        sort: { key: scope.clientSort, direction: scope.clientDir },
        hardestClientId: null,
        easiestClientId: null
      }
    };
  }

  if (!options.skipEnsureMetrics) {
    await ensureDashboardMetrics(scope.scopedClientIds, scope.filters.startDate, scope.filters.endDate);
  }

  const [mainRows, agentRows, channelRows, clientRows, serviceRows, clientSlaConfigs] = await Promise.all([
    getComputedMetricsRows({
      clientIds: scope.scopedClientIds,
      startDate: scope.filters.startDate,
      endDate: scope.filters.endDate,
      scope: scope.selectedAgent ? "agent" : "client",
      agentId: scope.selectedAgent?.id ?? null
    }),
    getComputedMetricsRows({
      clientIds: scope.scopedClientIds,
      startDate: scope.filters.startDate,
      endDate: scope.filters.endDate,
      scope: "agent",
      agentId: scope.selectedAgent?.id ?? null
    }),
    getComputedMetricsRows({
      clientIds: scope.scopedClientIds,
      startDate: scope.filters.startDate,
      endDate: scope.filters.endDate,
      scope: scope.selectedAgent ? "agent_channel" : "channel",
      agentId: scope.selectedAgent?.id ?? null
    }),
    getComputedMetricsRows({
      clientIds: scope.scopedClientIds,
      startDate: scope.filters.startDate,
      endDate: scope.filters.endDate,
      scope: scope.selectedAgent ? "agent" : "client",
      agentId: scope.selectedAgent?.id ?? null
    }),
    getServiceMetricWindowRows({
      clientIds: scope.scopedClientIds,
      startDate: scope.filters.startDate,
      endDate: scope.filters.endDate,
      agentMappingId: scope.selectedAgent?.id ?? null
    }),
    getClientSlaConfigs(scope.scopedClientIds)
  ]);

  for (const client of scope.visibleClients) {
    const config = clientSlaConfigs.get(client.id);

    if (config) {
      config.clientName = client.name;
    }
  }

  const serviceAnalysis = analyseServiceRows(serviceRows, scope.clientNameById, clientSlaConfigs, {
    startDate: scope.filters.startDate,
    endDate: scope.filters.endDate
  });

  if (options.includeAdminAlerts) {
    await ensureSlaAlertEvents(serviceAnalysis.alertCandidates);
  }

  const alerts = options.includeAdminAlerts ? await getSlaAlertFeed(scope.scopedClientIds) : [];
  const leaderboardRows = sortAgentRows(
    buildAgentLeaderboardRows(agentRows, scope.agentOptions, scope.clientNameById),
    scope.agentSort,
    scope.agentDir
  );
  const clientComparisonRows = buildClientComparisonRows(
    clientRows,
    scope.clientNameById,
    serviceAnalysis.byClientSla
  );
  const sortedClientRows = sortClientRows(clientComparisonRows, scope.clientSort, scope.clientDir);
  const difficultyRanking = rankClientDifficulty(clientComparisonRows);
  const activeAgentCount = scope.selectedAgent ? (leaderboardRows.length > 0 ? 1 : 0) : leaderboardRows.length;

  return {
    filters: scope.filters,
    view: scope.view,
    granularity: scope.granularity,
    visibleClients: scope.visibleClients,
    agentOptions: scope.agentOptions,
    selectedAgent: scope.selectedAgent,
    hasVisibleClients: true,
    overview: buildOverview(mainRows, serviceAnalysis.serviceStats, activeAgentCount),
    sla: serviceAnalysis.overallSla,
    alerts,
    trends: {
      volume: buildVolumeTrends(mainRows),
      response: buildResponseTrends(mainRows),
      channel: buildChannelTrends(channelRows)
    },
    leaderboard: {
      rows: leaderboardRows,
      sort: { key: scope.agentSort, direction: scope.agentDir }
    },
    clients: {
      rows: sortedClientRows,
      sort: { key: scope.clientSort, direction: scope.clientDir },
      ...difficultyRanking
    }
  };
}

export async function getAgentDetailData(agentId: string, searchParams: DashboardSearchParams = {}) {
  const baseScope = await resolveDashboardScope({
    ...searchParams,
    client: "all",
    agent: undefined
  });

  if (baseScope.visibleClients.length === 0) {
    return null;
  }

  const visibleAgentOptions = await getVisibleAgents(baseScope.visibleClients.map((client) => client.id));
  const agent = visibleAgentOptions.find((option) => option.id === agentId) ?? null;

  if (!agent) {
    return null;
  }

  await ensureDashboardMetrics([agent.clientId], baseScope.filters.startDate, baseScope.filters.endDate);

  const [agentRows, peerAgentRows, clientRows, serviceRows, clientSlaConfigs] = await Promise.all([
    getComputedMetricsRows({
      clientIds: [agent.clientId],
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate,
      scope: "agent",
      agentId
    }),
    getComputedMetricsRows({
      clientIds: [agent.clientId],
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate,
      scope: "agent"
    }),
    getComputedMetricsRows({
      clientIds: [agent.clientId],
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate,
      scope: "client"
    }),
    getServiceMetricWindowRows({
      clientIds: [agent.clientId],
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate,
      agentMappingId: agent.id
    }),
    getClientSlaConfigs([agent.clientId])
  ]);

  const agentClientConfig = clientSlaConfigs.get(agent.clientId);

  if (agentClientConfig) {
    agentClientConfig.clientName = agent.clientName;
  }
  const serviceAnalysis = analyseServiceRows(serviceRows, baseScope.clientNameById, clientSlaConfigs, {
    startDate: baseScope.filters.startDate,
    endDate: baseScope.filters.endDate
  });

  const peerRows = sortAgentRows(
    buildAgentLeaderboardRows(
      peerAgentRows,
      visibleAgentOptions.filter((option) => option.clientId === agent.clientId),
      baseScope.clientNameById
    ),
    baseScope.agentSort,
    baseScope.agentDir
  );
  const clientContext =
    buildClientComparisonRows(clientRows, baseScope.clientNameById, serviceAnalysis.byClientSla).find(
      (row) => row.clientId === agent.clientId
    ) ?? null;

  return {
    filters: {
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate,
      clientId: agent.clientId,
      agentId: agent.id
    },
    granularity: baseScope.granularity,
    visibleClients: baseScope.visibleClients,
    agent,
    overview: buildOverview(agentRows, serviceAnalysis.serviceStats, agentRows.length > 0 ? 1 : 0),
    sla: serviceAnalysis.byClientSla.get(agent.clientId) ?? null,
    trends: buildTrendSet(agentRows, baseScope.granularity),
    peers: {
      rows: peerRows,
      sort: { key: baseScope.agentSort, direction: baseScope.agentDir },
      rank: peerRows.findIndex((row) => row.agentId === agent.id) + 1 || null
    },
    clientContext
  } satisfies AgentDetailData;
}

export async function getClientDetailData(clientId: string, searchParams: DashboardSearchParams = {}) {
  const baseScope = await resolveDashboardScope({
    ...searchParams,
    client: "all",
    agent: undefined
  });

  if (baseScope.visibleClients.length === 0) {
    return null;
  }

  const client = baseScope.visibleClients.find((candidate) => candidate.id === clientId) ?? null;

  if (!client) {
    return null;
  }

  await ensureDashboardMetrics(
    baseScope.visibleClients.map((candidate) => candidate.id),
    baseScope.filters.startDate,
    baseScope.filters.endDate
  );

  const clientAgentOptions = await getVisibleAgents([client.id]);
  const [clientRows, agentRows, portfolioRows, serviceRows, clientSlaConfigs] = await Promise.all([
    getComputedMetricsRows({
      clientIds: [client.id],
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate,
      scope: "client"
    }),
    getComputedMetricsRows({
      clientIds: [client.id],
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate,
      scope: "agent"
    }),
    getComputedMetricsRows({
      clientIds: baseScope.visibleClients.map((candidate) => candidate.id),
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate,
      scope: "client"
    }),
    getServiceMetricWindowRows({
      clientIds: [client.id],
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate
    }),
    getClientSlaConfigs(baseScope.visibleClients.map((candidate) => candidate.id))
  ]);

  for (const visibleClient of baseScope.visibleClients) {
    const config = clientSlaConfigs.get(visibleClient.id);

    if (config) {
      config.clientName = visibleClient.name;
    }
  }

  const detailServiceAnalysis = analyseServiceRows(serviceRows, baseScope.clientNameById, clientSlaConfigs, {
    startDate: baseScope.filters.startDate,
    endDate: baseScope.filters.endDate
  });
  const portfolioServiceRows = await getServiceMetricWindowRows({
    clientIds: baseScope.visibleClients.map((candidate) => candidate.id),
    startDate: baseScope.filters.startDate,
    endDate: baseScope.filters.endDate
  });
  const portfolioServiceAnalysis = analyseServiceRows(
    portfolioServiceRows,
    baseScope.clientNameById,
    clientSlaConfigs,
    {
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate
    }
  );

  const sortedAgents = sortAgentRows(
    buildAgentLeaderboardRows(agentRows, clientAgentOptions, baseScope.clientNameById),
    baseScope.agentSort,
    baseScope.agentDir
  );
  const portfolioContext =
    buildClientComparisonRows(portfolioRows, baseScope.clientNameById, portfolioServiceAnalysis.byClientSla).find(
      (row) => row.clientId === client.id
    ) ?? null;

  return {
    filters: {
      startDate: baseScope.filters.startDate,
      endDate: baseScope.filters.endDate,
      clientId: client.id,
      agentId: "all"
    },
    granularity: baseScope.granularity,
    visibleClients: baseScope.visibleClients,
    client,
    overview: buildOverview(clientRows, detailServiceAnalysis.serviceStats, sortedAgents.length),
    sla: detailServiceAnalysis.byClientSla.get(client.id) ?? null,
    trends: buildTrendSet(clientRows, baseScope.granularity),
    agents: {
      rows: sortedAgents,
      sort: { key: baseScope.agentSort, direction: baseScope.agentDir }
    },
    portfolioContext
  } satisfies ClientDetailData;
}
