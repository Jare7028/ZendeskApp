import "server-only";

import { recomputeComputedMetricsForDateRange } from "@/lib/metrics/compute";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVisibleClients } from "@/lib/zendesk/status";

type JsonObject = Record<string, unknown>;

type DashboardSearchParams = {
  client?: string;
  agent?: string;
  start?: string;
  end?: string;
};

type AgentOption = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  zendeskAgentId: string | null;
};

type ComputedMetricRow = {
  client_id: string;
  metric_date: string;
  metric_key: string;
  dimension: Record<string, string | undefined> | null;
  metric_value: number;
};

type TicketRow = {
  id: string;
  raw_payload: JsonObject | null;
};

type TicketMetricRow = {
  ticket_id: string;
  first_response_minutes: number | null;
  full_resolution_minutes: number | null;
  payload: JsonObject | null;
};

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
  let query = supabase
    .from("computed_metrics")
    .select("client_id,metric_date,metric_key,dimension,metric_value")
    .in("client_id", options.clientIds)
    .gte("metric_date", options.startDate)
    .lte("metric_date", options.endDate)
    .contains("dimension", { scope: options.scope });

  if (options.agentId) {
    query = query.contains("dimension", {
      scope: options.scope,
      agentMappingId: options.agentId
    });
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as ComputedMetricRow[];
}

function getMetricValue(rows: ComputedMetricRow[], metricKey: string) {
  return rows
    .filter((row) => row.metric_key === metricKey)
    .reduce((sum, row) => sum + Number(row.metric_value), 0);
}

function buildOverview(rows: ComputedMetricRow[]) {
  const totalInteractions = getMetricValue(rows, "total_interactions");
  const totalHoursWorked = getMetricValue(rows, "total_hours_worked");
  const totalActivityHours = getMetricValue(rows, "total_activity_hours");
  const totalReplies = getMetricValue(rows, "total_replies");

  return {
    totalInteractions,
    interactionsPerHourWorked: totalHoursWorked > 0 ? totalInteractions / totalHoursWorked : null,
    agentUtilisationRatio: totalHoursWorked > 0 ? totalActivityHours / totalHoursWorked : null,
    repliesPerTicket: totalInteractions > 0 ? totalReplies / totalInteractions : null
  };
}

function buildVolumeTrend(rows: ComputedMetricRow[]) {
  const dates = [...new Set(rows.map((row) => row.metric_date))].sort();

  return dates.map((date) => {
    const dayRows = rows.filter((row) => row.metric_date === date);
    const hoursWorked = getMetricValue(dayRows, "total_hours_worked");
    const activityHours = getMetricValue(dayRows, "total_activity_hours");

    return {
      date,
      interactions: getMetricValue(dayRows, "total_interactions"),
      hoursWorked,
      utilisationRatio: hoursWorked > 0 ? activityHours / hoursWorked : null
    };
  });
}

function buildResponseTrend(rows: ComputedMetricRow[]) {
  const dates = [...new Set(rows.map((row) => row.metric_date))].sort();

  return dates.map((date) => {
    const dayRows = rows.filter((row) => row.metric_date === date);
    const firstReplyCount = getMetricValue(dayRows, "tickets_with_first_reply");
    const resolutionCount = getMetricValue(dayRows, "tickets_with_resolution");
    const requesterWaitCount = getMetricValue(dayRows, "tickets_with_requester_wait");

    return {
      date,
      avgFirstReplyMinutes:
        firstReplyCount > 0 ? getMetricValue(dayRows, "total_first_reply_minutes") / firstReplyCount : null,
      avgFullResolutionMinutes:
        resolutionCount > 0
          ? getMetricValue(dayRows, "total_full_resolution_minutes") / resolutionCount
          : null,
      requesterWaitMinutes:
        requesterWaitCount > 0
          ? getMetricValue(dayRows, "total_requester_wait_minutes") / requesterWaitCount
          : null
    };
  });
}

function buildChannelTrend(rows: ComputedMetricRow[]) {
  const dates = [...new Set(rows.map((row) => row.metric_date))].sort();
  const channels = ["email", "chat", "phone", "other"] as const;

  return dates.map((date) => {
    const dayRows = rows.filter((row) => row.metric_date === date && row.metric_key === "total_interactions");
    const values = Object.fromEntries(
      channels.map((channel) => [
        channel,
        dayRows
          .filter((row) => row.dimension?.channel === channel)
          .reduce((sum, row) => sum + Number(row.metric_value), 0)
      ])
    );

    return {
      date,
      ...values
    } as {
      date: string;
      email: number;
      chat: number;
      phone: number;
      other: number;
    };
  });
}

async function getExactServiceSummary(options: {
  clientIds: string[];
  startDate: string;
  endDate: string;
  selectedAgent: AgentOption | null;
}) {
  const supabase = createServerSupabaseClient().schema("app");
  const { data: ticketData, error: ticketError } = await supabase
    .from("tickets")
    .select("id,raw_payload")
    .in("client_id", options.clientIds)
    .gte("created_at_source", `${options.startDate}T00:00:00.000Z`)
    .lte("created_at_source", `${options.endDate}T23:59:59.999Z`);

  if (ticketError) {
    throw ticketError;
  }

  const tickets = ((ticketData ?? []) as TicketRow[]).filter((ticket) => {
    if (!options.selectedAgent?.zendeskAgentId) {
      return true;
    }

    return String(ticket.raw_payload?.assignee_id ?? "") === options.selectedAgent.zendeskAgentId;
  });

  if (tickets.length === 0) {
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

  const ticketIds = tickets.map((ticket) => ticket.id);
  const metricRows: TicketMetricRow[] = [];

  for (let index = 0; index < ticketIds.length; index += 200) {
    const chunk = ticketIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("ticket_metrics")
      .select("ticket_id,first_response_minutes,full_resolution_minutes,payload")
      .in("ticket_id", chunk);

    if (error) {
      throw error;
    }

    metricRows.push(...((data ?? []) as TicketMetricRow[]));
  }

  const firstReplyValues = metricRows
    .map((row) => row.first_response_minutes)
    .filter((value): value is number => typeof value === "number");
  const resolutionValues = metricRows
    .map((row) => row.full_resolution_minutes)
    .filter((value): value is number => typeof value === "number");
  const requesterWaitValues = metricRows
    .map((row) => readPayloadNumber(row.payload, "requester_wait_time_in_minutes"))
    .filter((value): value is number => typeof value === "number");

  return {
    avgFirstReplyMinutes: average(firstReplyValues),
    medianFirstReplyMinutes: percentile(firstReplyValues, 0.5),
    p90FirstReplyMinutes: percentile(firstReplyValues, 0.9),
    avgFullResolutionMinutes: average(resolutionValues),
    medianFullResolutionMinutes: percentile(resolutionValues, 0.5),
    p90FullResolutionMinutes: percentile(resolutionValues, 0.9),
    requesterWaitTimeMinutes: average(requesterWaitValues)
  };
}

export async function getDashboardData(searchParams: DashboardSearchParams = {}) {
  const visibleClients = await getVisibleClients();
  const { startDate, endDate } = clampDateRange(searchParams.start, searchParams.end);

  if (visibleClients.length === 0) {
    return {
      filters: {
        startDate,
        endDate,
        clientId: "all",
        agentId: "all"
      },
      visibleClients,
      agentOptions: [] as AgentOption[],
      selectedAgent: null,
      hasVisibleClients: false,
      overview: {
        totalInteractions: 0,
        interactionsPerHourWorked: null,
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
      },
      trends: {
        volume: [],
        response: [],
        channel: []
      }
    };
  }

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

  if (scopedClientIds.length > 0) {
    await recomputeComputedMetricsForDateRange({
      clientIds: scopedClientIds,
      startDate,
      endDate
    });
  }

  const mainRows = await getComputedMetricsRows({
    clientIds: scopedClientIds,
    startDate,
    endDate,
    scope: selectedAgent ? "agent" : "client",
    agentId: selectedAgent?.id ?? null
  });
  const channelRows = await getComputedMetricsRows({
    clientIds: scopedClientIds,
    startDate,
    endDate,
    scope: selectedAgent ? "agent_channel" : "channel",
    agentId: selectedAgent?.id ?? null
  });
  const agentRows = selectedAgent
    ? mainRows
    : await getComputedMetricsRows({
        clientIds: scopedClientIds,
        startDate,
        endDate,
        scope: "agent"
      });
  const exactServiceSummary = await getExactServiceSummary({
    clientIds: scopedClientIds,
    startDate,
    endDate,
    selectedAgent
  });

  const perAgentTotals = new Map<string, number>();
  for (const row of agentRows) {
    if (row.metric_key !== "total_reopens" || !row.dimension?.agentMappingId) {
      continue;
    }

    const key = row.dimension.agentMappingId;
    perAgentTotals.set(key, (perAgentTotals.get(key) ?? 0) + Number(row.metric_value));
  }

  const reopensPerAgent =
    perAgentTotals.size > 0
      ? [...perAgentTotals.values()].reduce((sum, value) => sum + value, 0) / perAgentTotals.size
      : null;

  return {
    filters: {
      startDate,
      endDate,
      clientId: selectedClientId,
      agentId: selectedAgent?.id ?? "all"
    },
    visibleClients,
    agentOptions,
    selectedAgent,
    hasVisibleClients: visibleClients.length > 0,
    overview: {
      ...buildOverview(mainRows),
      reopensPerAgent,
      ...exactServiceSummary
    },
    trends: {
      volume: buildVolumeTrend(mainRows),
      response: buildResponseTrend(mainRows),
      channel: buildChannelTrend(channelRows)
    }
  };
}
