import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type JsonObject = Record<string, unknown>;

type AgentMappingRow = {
  id: string;
  client_id: string;
  zendesk_connection_id: string | null;
  connecteam_connection_id: string | null;
  zendesk_agent_id: string | null;
  connecteam_user_id: string | null;
  display_name: string;
  inclusion_status: "mapped" | "ignored" | "unmapped";
};

type TicketRow = {
  id: string;
  client_id: string;
  agent_mapping_id: string | null;
  channel: string | null;
  created_at_source: string | null;
  raw_payload: JsonObject | null;
};

type TicketMetricRow = {
  ticket_id: string;
  first_response_minutes: number | null;
  full_resolution_minutes: number | null;
  payload: JsonObject | null;
};

type TimesheetRow = {
  client_id: string;
  zendesk_connection_id: string | null;
  connecteam_connection_id: string | null;
  agent_mapping_id: string | null;
  work_date: string;
  minutes_worked: number;
  payload: JsonObject | null;
};

type MetricScope = "client" | "agent" | "channel" | "agent_channel";

type MetricDimension = {
  scope: MetricScope;
  agentMappingId?: string;
  agentName?: string;
  channel?: string;
};

type Accumulator = {
  totalInteractions: number;
  totalMinutesWorked: number;
  activeMinutesWorked: number;
  totalReopens: number;
  totalReplies: number;
  totalFirstReplyMinutes: number;
  totalFullResolutionMinutes: number;
  totalRequesterWaitMinutes: number;
  ticketsWithFirstReply: number;
  ticketsWithResolution: number;
  ticketsWithRequesterWait: number;
  firstReplyValues: number[];
  fullResolutionValues: number[];
  requesterWaitValues: number[];
  activeAgentIds: Set<string>;
};

const METRIC_BATCH_SIZE = 500;

function toDateKey(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeChannel(value: string | null | undefined) {
  const channel = value?.trim().toLowerCase();

  if (channel === "email" || channel === "chat" || channel === "phone") {
    return channel;
  }

  return "other";
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNestedCalendarMinutes(value: unknown): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return readNumber((value as JsonObject).calendar);
}

function readPayloadNumber(payload: JsonObject | null, keys: string[]) {
  if (!payload) {
    return null;
  }

  for (const key of keys) {
    const directValue = readNumber(payload[key]);
    if (directValue !== null) {
      return directValue;
    }

    const nestedMinutes = readNestedCalendarMinutes(payload[key]);
    if (nestedMinutes !== null) {
      return nestedMinutes;
    }
  }

  return null;
}

function percentile(values: number[], target: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) {
    return sorted[0];
  }

  const rank = (sorted.length - 1) * target;
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createAccumulator(): Accumulator {
  return {
    totalInteractions: 0,
    totalMinutesWorked: 0,
    activeMinutesWorked: 0,
    totalReopens: 0,
    totalReplies: 0,
    totalFirstReplyMinutes: 0,
    totalFullResolutionMinutes: 0,
    totalRequesterWaitMinutes: 0,
    ticketsWithFirstReply: 0,
    ticketsWithResolution: 0,
    ticketsWithRequesterWait: 0,
    firstReplyValues: [],
    fullResolutionValues: [],
    requesterWaitValues: [],
    activeAgentIds: new Set<string>()
  };
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}

function normalizeMetricDimension(dimension: MetricDimension): MetricDimension {
  return sortJsonValue(dimension) as MetricDimension;
}

function accumulatorKey(clientId: string, metricDate: string, dimension: MetricDimension) {
  return `${clientId}:${metricDate}:${JSON.stringify(normalizeMetricDimension(dimension))}`;
}

function getAccumulator(
  store: Map<string, { clientId: string; metricDate: string; dimension: MetricDimension; value: Accumulator }>,
  clientId: string,
  metricDate: string,
  dimension: MetricDimension
) {
  const key = accumulatorKey(clientId, metricDate, dimension);
  const existing = store.get(key);

  if (existing) {
    return existing.value;
  }

  const created = {
    clientId,
    metricDate,
    dimension,
    value: createAccumulator()
  };
  store.set(key, created);
  return created.value;
}

function getScopedConnecteamUserKey(clientId: string, connecteamConnectionId: string | null, connecteamUserId: string) {
  return `${clientId}:${connecteamConnectionId ?? "none"}:${connecteamUserId}`;
}

function getClientConnecteamUserKey(clientId: string, connecteamUserId: string) {
  return `${clientId}:${connecteamUserId}`;
}

function readPayloadString(payload: JsonObject | null, key: string) {
  const value = payload?.[key];

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getActivityKey(agentMappingId: string, metricDate: string) {
  return `${agentMappingId}:${metricDate}`;
}

function getTimesheetCandidateMappings(
  timesheet: TimesheetRow,
  mappingById: Map<string, AgentMappingRow>,
  mappingByScopedConnecteamUser: Map<string, AgentMappingRow>,
  mappingsByClientConnecteamUser: Map<string, AgentMappingRow[]>
) {
  if (timesheet.agent_mapping_id) {
    const directMatch = mappingById.get(timesheet.agent_mapping_id);
    if (directMatch) {
      return [directMatch];
    }
  }

  const connecteamUserId = readPayloadString(timesheet.payload, "connecteam_user_id");
  if (!connecteamUserId) {
    return [];
  }

  const scopedMatch = mappingByScopedConnecteamUser.get(
    getScopedConnecteamUserKey(timesheet.client_id, timesheet.connecteam_connection_id, connecteamUserId)
  );
  if (scopedMatch) {
    return [scopedMatch];
  }

  const candidates =
    mappingsByClientConnecteamUser.get(getClientConnecteamUserKey(timesheet.client_id, connecteamUserId)) ?? [];
  return candidates;
}

function resolveTimesheetAllocations(
  timesheet: TimesheetRow,
  mappingById: Map<string, AgentMappingRow>,
  mappingByScopedConnecteamUser: Map<string, AgentMappingRow>,
  mappingsByClientConnecteamUser: Map<string, AgentMappingRow[]>
) {
  const candidates = getTimesheetCandidateMappings(
    timesheet,
    mappingById,
    mappingByScopedConnecteamUser,
    mappingsByClientConnecteamUser
  );

  if (candidates.length === 0) {
    return [] as Array<{ mapping: AgentMappingRow; minutesWorked: number }>;
  }

  if (candidates.length === 1) {
    return [{ mapping: candidates[0], minutesWorked: timesheet.minutes_worked }];
  }

  let remainingMinutes = timesheet.minutes_worked;
  const evenSplitMinutes = Number((timesheet.minutes_worked / candidates.length).toFixed(4));

  return candidates.map((mapping, index) => {
    const minutesWorked =
      index === candidates.length - 1
        ? remainingMinutes
        : evenSplitMinutes;

    remainingMinutes = Number((remainingMinutes - minutesWorked).toFixed(4));

    return {
      mapping,
      minutesWorked
    };
  });
}

function pushTicketMetrics(accumulator: Accumulator, metric: TicketMetricRow | null) {
  const firstReply = metric?.first_response_minutes ?? null;
  const fullResolution = metric?.full_resolution_minutes ?? null;
  const requesterWait = readPayloadNumber(metric?.payload ?? null, ["requester_wait_time_in_minutes"]);
  const reopens = readPayloadNumber(metric?.payload ?? null, ["reopens", "reopen_count"]) ?? 0;
  const replies = readPayloadNumber(metric?.payload ?? null, ["replies"]) ?? 0;

  accumulator.totalInteractions += 1;
  accumulator.totalReopens += reopens;
  accumulator.totalReplies += replies;

  if (firstReply !== null) {
    accumulator.totalFirstReplyMinutes += firstReply;
    accumulator.ticketsWithFirstReply += 1;
    accumulator.firstReplyValues.push(firstReply);
  }

  if (fullResolution !== null) {
    accumulator.totalFullResolutionMinutes += fullResolution;
    accumulator.ticketsWithResolution += 1;
    accumulator.fullResolutionValues.push(fullResolution);
  }

  if (requesterWait !== null) {
    accumulator.totalRequesterWaitMinutes += requesterWait;
    accumulator.ticketsWithRequesterWait += 1;
    accumulator.requesterWaitValues.push(requesterWait);
  }
}

function finalizeRows(
  store: Map<string, { clientId: string; metricDate: string; dimension: MetricDimension; value: Accumulator }>
) {
  const rowsByKey = new Map<string, {
    client_id: string;
    metric_date: string;
    metric_key: string;
    dimension: MetricDimension;
    metric_value: number;
    computed_at: string;
  }>();
  const computedAt = new Date().toISOString();

  for (const entry of store.values()) {
    const dimension = normalizeMetricDimension(entry.dimension);
    const hoursWorked = entry.value.totalMinutesWorked / 60;
    const activityHours = entry.value.activeMinutesWorked / 60;
    const activeAgentCount = entry.value.activeAgentIds.size;
    const metrics = new Map<string, number | null>([
      ["total_interactions", entry.value.totalInteractions],
      ["total_hours_worked", hoursWorked],
      ["total_activity_hours", activityHours],
      [
        "interactions_per_hour_worked",
        hoursWorked > 0 ? entry.value.totalInteractions / hoursWorked : null
      ],
      ["avg_first_reply_minutes", average(entry.value.firstReplyValues)],
      ["median_first_reply_minutes", percentile(entry.value.firstReplyValues, 0.5)],
      ["p90_first_reply_minutes", percentile(entry.value.firstReplyValues, 0.9)],
      ["avg_full_resolution_minutes", average(entry.value.fullResolutionValues)],
      ["median_full_resolution_minutes", percentile(entry.value.fullResolutionValues, 0.5)],
      ["p90_full_resolution_minutes", percentile(entry.value.fullResolutionValues, 0.9)],
      ["requester_wait_time_minutes", average(entry.value.requesterWaitValues)],
      ["agent_utilisation_ratio", hoursWorked > 0 ? activityHours / hoursWorked : null],
      [
        "reopens_per_agent",
        activeAgentCount > 0 ? entry.value.totalReopens / activeAgentCount : null
      ],
      [
        "replies_per_ticket",
        entry.value.totalInteractions > 0 ? entry.value.totalReplies / entry.value.totalInteractions : null
      ],
      ["total_reopens", entry.value.totalReopens],
      ["total_replies", entry.value.totalReplies],
      ["total_first_reply_minutes", entry.value.totalFirstReplyMinutes],
      ["total_full_resolution_minutes", entry.value.totalFullResolutionMinutes],
      ["total_requester_wait_minutes", entry.value.totalRequesterWaitMinutes],
      ["tickets_with_first_reply", entry.value.ticketsWithFirstReply],
      ["tickets_with_resolution", entry.value.ticketsWithResolution],
      ["tickets_with_requester_wait", entry.value.ticketsWithRequesterWait],
      ["active_agents_count", activeAgentCount]
    ]);

    for (const [metricKey, metricValue] of metrics) {
      if (metricValue === null || !Number.isFinite(metricValue)) {
        continue;
      }

      const row = {
        client_id: entry.clientId,
        metric_date: entry.metricDate,
        metric_key: metricKey,
        dimension,
        metric_value: Number(metricValue.toFixed(4)),
        computed_at: computedAt
      };
      const rowKey = [
        row.client_id,
        row.metric_date,
        row.metric_key,
        JSON.stringify(row.dimension)
      ].join("|");

      rowsByKey.set(rowKey, row);
    }
  }

  return [...rowsByKey.values()];
}

async function insertComputedMetricRows(
  rows: Array<{
    client_id: string;
    metric_date: string;
    metric_key: string;
    dimension: MetricDimension;
    metric_value: number;
    computed_at: string;
  }>
) {
  if (rows.length === 0) {
    return;
  }

  const supabase = createAdminSupabaseClient();

  for (let index = 0; index < rows.length; index += METRIC_BATCH_SIZE) {
    const batch = rows.slice(index, index + METRIC_BATCH_SIZE);
    const { error } = await supabase
      .from("computed_metrics")
      .upsert(batch, { onConflict: "client_id,metric_date,metric_key,dimension" });

    if (error) {
      throw error;
    }
  }
}

export async function recomputeComputedMetricsForDateRange({
  clientIds,
  startDate,
  endDate
}: {
  clientIds: string[];
  startDate: string;
  endDate: string;
}) {
  if (clientIds.length === 0) {
    return;
  }

  const supabase = createAdminSupabaseClient();
  const [agentMappingsResult, ticketsResult, timesheetsResult] = await Promise.all([
    supabase
      .from("agent_mappings")
      .select("id,client_id,zendesk_connection_id,connecteam_connection_id,zendesk_agent_id,connecteam_user_id,display_name,inclusion_status")
      .in("client_id", clientIds),
    supabase
      .from("tickets")
      .select("id,client_id,agent_mapping_id,channel,created_at_source,raw_payload")
      .in("client_id", clientIds)
      .gte("created_at_source", `${startDate}T00:00:00.000Z`)
      .lte("created_at_source", `${endDate}T23:59:59.999Z`),
    supabase
      .from("timesheet_data")
      .select("client_id,zendesk_connection_id,connecteam_connection_id,agent_mapping_id,work_date,minutes_worked,payload")
      .in("client_id", clientIds)
      .gte("work_date", startDate)
      .lte("work_date", endDate)
  ]);

  if (agentMappingsResult.error) {
    throw agentMappingsResult.error;
  }

  if (ticketsResult.error) {
    throw ticketsResult.error;
  }
  if (timesheetsResult.error) {
    throw timesheetsResult.error;
  }

  const agentMappings = (agentMappingsResult.data ?? []) as AgentMappingRow[];
  const tickets = (ticketsResult.data ?? []) as TicketRow[];
  const timesheets = (timesheetsResult.data ?? []) as TimesheetRow[];
  const ticketMetrics: TicketMetricRow[] = [];
  const ticketIds = tickets.map((ticket) => ticket.id);

  for (let index = 0; index < ticketIds.length; index += 200) {
    const chunk = ticketIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("ticket_metrics")
      .select("ticket_id,first_response_minutes,full_resolution_minutes,payload")
      .in("ticket_id", chunk);

    if (error) {
      throw error;
    }

    ticketMetrics.push(...((data ?? []) as TicketMetricRow[]));
  }

  for (const clientId of clientIds) {
    const { error } = await supabase
      .from("computed_metrics")
      .delete()
      .eq("client_id", clientId)
      .gte("metric_date", startDate)
      .lte("metric_date", endDate);

    if (error) {
      throw error;
    }
  }

  const includedMappings = agentMappings.filter((mapping) => mapping.inclusion_status === "mapped");
  const mappingById = new Map(includedMappings.map((mapping) => [mapping.id, mapping]));
  const mappingByZendeskAgentId = new Map(
    includedMappings
      .filter((mapping) => mapping.zendesk_agent_id)
      .map((mapping) => [`${mapping.client_id}:${mapping.zendesk_agent_id as string}`, mapping])
  );
  const mappingByScopedConnecteamUser = new Map(
    includedMappings
      .filter((mapping) => mapping.connecteam_user_id)
      .map((mapping) => [
        getScopedConnecteamUserKey(
          mapping.client_id,
          mapping.connecteam_connection_id,
          mapping.connecteam_user_id as string
        ),
        mapping
      ])
  );
  const mappingsByClientConnecteamUser = includedMappings.reduce((store, mapping) => {
    if (!mapping.connecteam_user_id) {
      return store;
    }

    const key = getClientConnecteamUserKey(mapping.client_id, mapping.connecteam_user_id);
    const existing = store.get(key) ?? [];
    existing.push(mapping);
    store.set(key, existing);
    return store;
  }, new Map<string, AgentMappingRow[]>());
  const metricsByTicketId = new Map(ticketMetrics.map((metric) => [metric.ticket_id, metric]));
  const activityDaysByAgent = new Set<string>();
  const interactionCountByAgentDay = new Map<string, number>();
  const store = new Map<
    string,
    { clientId: string; metricDate: string; dimension: MetricDimension; value: Accumulator }
  >();

  for (const ticket of tickets) {
    const metricDate = toDateKey(ticket.created_at_source);
    if (!metricDate) {
      continue;
    }

    const channel = normalizeChannel(ticket.channel);
    const assigneeId = ticket.raw_payload?.assignee_id;
    const agentMapping =
      (ticket.agent_mapping_id ? mappingById.get(ticket.agent_mapping_id) : null) ??
      (assigneeId === null || assigneeId === undefined
        ? null
        : mappingByZendeskAgentId.get(`${ticket.client_id}:${String(assigneeId)}`) ?? null);
    const metric = metricsByTicketId.get(ticket.id) ?? null;
    const clientAccumulator = getAccumulator(store, ticket.client_id, metricDate, { scope: "client" });
    const channelAccumulator = getAccumulator(store, ticket.client_id, metricDate, { scope: "channel", channel });

    pushTicketMetrics(clientAccumulator, metric);
    pushTicketMetrics(channelAccumulator, metric);

    if (!agentMapping) {
      continue;
    }

    const activityKey = getActivityKey(agentMapping.id, metricDate);
    activityDaysByAgent.add(activityKey);
    interactionCountByAgentDay.set(activityKey, (interactionCountByAgentDay.get(activityKey) ?? 0) + 1);
    clientAccumulator.activeAgentIds.add(agentMapping.id);
    channelAccumulator.activeAgentIds.add(agentMapping.id);

    const agentAccumulator = getAccumulator(store, ticket.client_id, metricDate, {
      scope: "agent",
      agentMappingId: agentMapping.id,
      agentName: agentMapping.display_name
    });
    agentAccumulator.activeAgentIds.add(agentMapping.id);
    pushTicketMetrics(agentAccumulator, metric);

    const agentChannelAccumulator = getAccumulator(store, ticket.client_id, metricDate, {
      scope: "agent_channel",
      agentMappingId: agentMapping.id,
      agentName: agentMapping.display_name,
      channel
    });
    agentChannelAccumulator.activeAgentIds.add(agentMapping.id);
    pushTicketMetrics(agentChannelAccumulator, metric);
  }

  for (const timesheet of timesheets) {
    const allocations = resolveTimesheetAllocations(
      timesheet,
      mappingById,
      mappingByScopedConnecteamUser,
      mappingsByClientConnecteamUser
    );

    if (allocations.length === 0) {
      continue;
    }

    const clientAccumulator = getAccumulator(store, timesheet.client_id, timesheet.work_date, { scope: "client" });
    clientAccumulator.totalMinutesWorked += timesheet.minutes_worked;

    if (allocations.some(({ mapping }) => activityDaysByAgent.has(getActivityKey(mapping.id, timesheet.work_date)))) {
      clientAccumulator.activeMinutesWorked += timesheet.minutes_worked;
    }

    for (const allocation of allocations) {
      const agentAccumulator = getAccumulator(store, timesheet.client_id, timesheet.work_date, {
        scope: "agent",
        agentMappingId: allocation.mapping.id,
        agentName: allocation.mapping.display_name
      });
      agentAccumulator.totalMinutesWorked += allocation.minutesWorked;

      if (activityDaysByAgent.has(getActivityKey(allocation.mapping.id, timesheet.work_date))) {
        agentAccumulator.activeMinutesWorked += allocation.minutesWorked;
      }
    }
  }

  await insertComputedMetricRows(finalizeRows(store));
}
