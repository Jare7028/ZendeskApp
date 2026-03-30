import { NextRequest } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/session";
import { getAgentDetailData, getClientDetailData, getDashboardData, type DashboardSearchParams } from "@/lib/metrics/dashboard";

function readSearchParams(searchParams: URLSearchParams): DashboardSearchParams {
  return {
    start: searchParams.get("start") ?? undefined,
    end: searchParams.get("end") ?? undefined,
    client: searchParams.get("client") ?? undefined,
    agent: searchParams.get("agent") ?? undefined,
    view: searchParams.get("view") ?? undefined,
    granularity: searchParams.get("granularity") ?? undefined,
    agentSort: searchParams.get("agentSort") ?? undefined,
    agentDir: searchParams.get("agentDir") ?? undefined,
    clientSort: searchParams.get("clientSort") ?? undefined,
    clientDir: searchParams.get("clientDir") ?? undefined
  };
}

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, "\"\"")}"` : stringValue;
}

function toCsv(columns: string[], rows: Array<Record<string, string | number | null | undefined>>) {
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(","));
  return [header, ...body].join("\n");
}

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();

  if (!context) {
    return new Response("Unauthorized", { status: 401 });
  }

  const searchParams = readSearchParams(request.nextUrl.searchParams);
  const report = request.nextUrl.searchParams.get("report") ?? "overview";

  if (report === "leaderboard") {
    const dashboard = await getDashboardData({ ...searchParams, view: "agents" });
    const columns = [
      "rank",
      "agentId",
      "agentName",
      "clientId",
      "clientName",
      "totalInteractions",
      "totalHoursWorked",
      "interactionsPerHourWorked",
      "avgFirstReplyMinutes",
      "avgFullResolutionMinutes",
      "totalReopens",
      "utilisation"
    ];
    const rows = dashboard.leaderboard.rows.map((row, index) => ({
      rank: index + 1,
      agentId: row.agentId,
      agentName: row.agentName,
      clientId: row.clientId,
      clientName: row.clientName,
      totalInteractions: row.totalInteractions,
      totalHoursWorked: row.totalHoursWorked,
      interactionsPerHourWorked: row.interactionsPerHourWorked,
      avgFirstReplyMinutes: row.avgFirstReplyMinutes,
      avgFullResolutionMinutes: row.avgFullResolutionMinutes,
      totalReopens: row.totalReopens,
      utilisation: row.utilisation
    }));

    return new Response(toCsv(columns, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="agent-leaderboard.csv"'
      }
    });
  }

  if (report === "clients") {
    const dashboard = await getDashboardData({ ...searchParams, view: "clients" });
    const columns = [
      "clientId",
      "clientName",
      "totalInteractions",
      "totalHoursWorked",
      "interactionsPerHourWorked",
      "avgFirstReplyMinutes",
      "avgFullResolutionMinutes",
      "utilisation",
      "repliesPerTicket",
      "capacityLabel",
      "capacityDetail"
    ];

    return new Response(toCsv(columns, dashboard.clients.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="client-comparison.csv"'
      }
    });
  }

  if (report === "agent-detail") {
    const agentId = request.nextUrl.searchParams.get("agent");

    if (!agentId) {
      return new Response("Missing agent", { status: 400 });
    }

    const detail = await getAgentDetailData(agentId, searchParams);

    if (!detail) {
      return new Response("Not found", { status: 404 });
    }

    const columns = [
      "rowType",
      "date",
      "label",
      "value",
      "agentId",
      "agentName",
      "clientId",
      "clientName",
      "rank",
      "totalInteractions",
      "totalHoursWorked",
      "interactionsPerHourWorked",
      "avgFirstReplyMinutes",
      "avgFullResolutionMinutes",
      "totalReopens",
      "utilisation"
    ];
    const rows: Array<Record<string, string | number | null | undefined>> = [
      { rowType: "summary", label: "totalTickets", value: detail.overview.totalInteractions, agentId: detail.agent.id, agentName: detail.agent.name, clientId: detail.agent.clientId, clientName: detail.agent.clientName },
      { rowType: "summary", label: "repliesPerHourWorked", value: detail.overview.repliesPerHourWorked, agentId: detail.agent.id, agentName: detail.agent.name, clientId: detail.agent.clientId, clientName: detail.agent.clientName },
      { rowType: "summary", label: "ticketsPerHourWorked", value: detail.overview.interactionsPerHourWorked, agentId: detail.agent.id, agentName: detail.agent.name, clientId: detail.agent.clientId, clientName: detail.agent.clientName },
      { rowType: "summary", label: "avgFirstReplyMinutes", value: detail.overview.avgFirstReplyMinutes, agentId: detail.agent.id, agentName: detail.agent.name, clientId: detail.agent.clientId, clientName: detail.agent.clientName },
      { rowType: "summary", label: "avgFullResolutionMinutes", value: detail.overview.avgFullResolutionMinutes, agentId: detail.agent.id, agentName: detail.agent.name, clientId: detail.agent.clientId, clientName: detail.agent.clientName },
      { rowType: "summary", label: "utilisation", value: detail.overview.agentUtilisationRatio, agentId: detail.agent.id, agentName: detail.agent.name, clientId: detail.agent.clientId, clientName: detail.agent.clientName }
    ];

    for (const point of detail.trends.volume) {
      rows.push({
        rowType: "trend",
        date: point.date,
        label: "volume",
        agentId: detail.agent.id,
        agentName: detail.agent.name,
        clientId: detail.agent.clientId,
        clientName: detail.agent.clientName,
        totalInteractions: point.interactions,
        totalHoursWorked: point.hoursWorked
      });
    }

    for (const point of detail.trends.response) {
      rows.push({
        rowType: "trend",
        date: point.date,
        label: "service",
        agentId: detail.agent.id,
        agentName: detail.agent.name,
        clientId: detail.agent.clientId,
        clientName: detail.agent.clientName,
        avgFirstReplyMinutes: point.avgFirstReplyMinutes,
        avgFullResolutionMinutes: point.avgFullResolutionMinutes
      });
    }

    for (const [index, row] of detail.peers.rows.entries()) {
      rows.push({
        rowType: "peer",
        rank: index + 1,
        agentId: row.agentId,
        agentName: row.agentName,
        clientId: row.clientId,
        clientName: row.clientName,
        totalInteractions: row.totalInteractions,
        totalHoursWorked: row.totalHoursWorked,
        interactionsPerHourWorked: row.interactionsPerHourWorked,
        avgFirstReplyMinutes: row.avgFirstReplyMinutes,
        avgFullResolutionMinutes: row.avgFullResolutionMinutes,
        totalReopens: row.totalReopens,
        utilisation: row.utilisation
      });
    }

    return new Response(toCsv(columns, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="agent-${detail.agent.id}-detail.csv"`
      }
    });
  }

  if (report === "client-detail") {
    const clientId = request.nextUrl.searchParams.get("client");

    if (!clientId || clientId === "all") {
      return new Response("Missing client", { status: 400 });
    }

    const detail = await getClientDetailData(clientId, searchParams);

    if (!detail) {
      return new Response("Not found", { status: 404 });
    }

    const columns = [
      "rowType",
      "date",
      "label",
      "value",
      "clientId",
      "clientName",
      "agentId",
      "agentName",
      "rank",
      "totalInteractions",
      "totalHoursWorked",
      "interactionsPerHourWorked",
      "avgFirstReplyMinutes",
      "avgFullResolutionMinutes",
      "totalReopens",
      "utilisation"
    ];
    const rows: Array<Record<string, string | number | null | undefined>> = [
      { rowType: "summary", label: "totalTickets", value: detail.overview.totalInteractions, clientId: detail.client.id, clientName: detail.client.name },
      { rowType: "summary", label: "repliesPerHourWorked", value: detail.overview.repliesPerHourWorked, clientId: detail.client.id, clientName: detail.client.name },
      { rowType: "summary", label: "ticketsPerHourWorked", value: detail.overview.interactionsPerHourWorked, clientId: detail.client.id, clientName: detail.client.name },
      { rowType: "summary", label: "avgFirstReplyMinutes", value: detail.overview.avgFirstReplyMinutes, clientId: detail.client.id, clientName: detail.client.name },
      { rowType: "summary", label: "avgFullResolutionMinutes", value: detail.overview.avgFullResolutionMinutes, clientId: detail.client.id, clientName: detail.client.name },
      { rowType: "summary", label: "utilisation", value: detail.overview.agentUtilisationRatio, clientId: detail.client.id, clientName: detail.client.name }
    ];

    for (const point of detail.trends.volume) {
      rows.push({
        rowType: "trend",
        date: point.date,
        label: "volume",
        clientId: detail.client.id,
        clientName: detail.client.name,
        totalInteractions: point.interactions,
        totalHoursWorked: point.hoursWorked
      });
    }

    for (const point of detail.trends.response) {
      rows.push({
        rowType: "trend",
        date: point.date,
        label: "service",
        clientId: detail.client.id,
        clientName: detail.client.name,
        avgFirstReplyMinutes: point.avgFirstReplyMinutes,
        avgFullResolutionMinutes: point.avgFullResolutionMinutes
      });
    }

    for (const [index, row] of detail.agents.rows.entries()) {
      rows.push({
        rowType: "agent",
        rank: index + 1,
        agentId: row.agentId,
        agentName: row.agentName,
        clientId: row.clientId,
        clientName: row.clientName,
        totalInteractions: row.totalInteractions,
        totalHoursWorked: row.totalHoursWorked,
        interactionsPerHourWorked: row.interactionsPerHourWorked,
        avgFirstReplyMinutes: row.avgFirstReplyMinutes,
        avgFullResolutionMinutes: row.avgFullResolutionMinutes,
        totalReopens: row.totalReopens,
        utilisation: row.utilisation
      });
    }

    return new Response(toCsv(columns, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="client-${detail.client.id}-detail.csv"`
      }
    });
  }

  const dashboard = await getDashboardData(searchParams);
  const columns = ["section", "label", "value", "date", "interactions", "hoursWorked", "avgFirstReplyMinutes", "avgFullResolutionMinutes"];
  const rows: Array<Record<string, string | number | null | undefined>> = [
    { section: "overview", label: "totalTickets", value: dashboard.overview.totalInteractions },
    { section: "overview", label: "totalReplies", value: dashboard.overview.totalReplies },
    { section: "overview", label: "repliesPerHourWorked", value: dashboard.overview.repliesPerHourWorked },
    { section: "overview", label: "ticketsPerHourWorked", value: dashboard.overview.interactionsPerHourWorked },
    { section: "overview", label: "avgFirstReplyMinutes", value: dashboard.overview.avgFirstReplyMinutes },
    { section: "overview", label: "avgFullResolutionMinutes", value: dashboard.overview.avgFullResolutionMinutes },
    { section: "overview", label: "requesterWaitTimeMinutes", value: dashboard.overview.requesterWaitTimeMinutes }
  ];

  for (const point of dashboard.trends.volume) {
    rows.push({
      section: "volumeTrend",
      date: point.date,
      interactions: point.interactions,
      hoursWorked: point.hoursWorked
    });
  }

  for (const point of dashboard.trends.response) {
    rows.push({
      section: "serviceTrend",
      date: point.date,
      avgFirstReplyMinutes: point.avgFirstReplyMinutes,
      avgFullResolutionMinutes: point.avgFullResolutionMinutes
    });
  }

  return new Response(toCsv(columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dashboard-overview.csv"'
    }
  });
}
