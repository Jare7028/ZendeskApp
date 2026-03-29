import { NextRequest } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/session";
import { createSimplePdf } from "@/lib/exports/pdf";
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

function formatMetric(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: digits
  }).format(value);
}

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();

  if (!context) {
    return new Response("Unauthorized", { status: 401 });
  }

  const searchParams = readSearchParams(request.nextUrl.searchParams);
  const report = request.nextUrl.searchParams.get("report") ?? "overview";
  let title = "Dashboard summary";
  let lines: string[] = [];
  let filename = "dashboard-summary.pdf";

  if (report === "leaderboard") {
    const dashboard = await getDashboardData({ ...searchParams, view: "agents" });
    title = "Agent leaderboard summary";
    filename = "agent-leaderboard-summary.pdf";
    lines = [
      `Window: ${dashboard.filters.startDate} to ${dashboard.filters.endDate}`,
      `Visible agents in export: ${dashboard.leaderboard.rows.length}`,
      `Top agent: ${dashboard.leaderboard.rows[0]?.agentName ?? "No data"}`,
      `Top throughput: ${formatMetric(dashboard.leaderboard.rows[0]?.interactionsPerHourWorked ?? null)}`,
      ...dashboard.leaderboard.rows.slice(0, 6).map(
        (row, index) =>
          `${index + 1}. ${row.agentName} (${row.clientName}) - ${formatMetric(row.totalInteractions, 0)} interactions, ${formatMetric(row.interactionsPerHourWorked)} int/hr`
      )
    ];
  } else if (report === "clients") {
    const dashboard = await getDashboardData({ ...searchParams, view: "clients" });
    title = "Client comparison summary";
    filename = "client-comparison-summary.pdf";
    lines = [
      `Window: ${dashboard.filters.startDate} to ${dashboard.filters.endDate}`,
      `Visible clients in export: ${dashboard.clients.rows.length}`,
      `Hardest client: ${dashboard.clients.rows.find((row) => row.clientId === dashboard.clients.hardestClientId)?.clientName ?? "No data"}`,
      `Easiest client: ${dashboard.clients.rows.find((row) => row.clientId === dashboard.clients.easiestClientId)?.clientName ?? "No data"}`,
      ...dashboard.clients.rows.slice(0, 6).map(
        (row) =>
          `${row.clientName} - ${formatMetric(row.totalInteractions, 0)} interactions, ${formatMetric(row.interactionsPerHourWorked)} int/hr, ${row.capacityLabel}`
      )
    ];
  } else if (report === "agent-detail") {
    const agentId = request.nextUrl.searchParams.get("agent");

    if (!agentId) {
      return new Response("Missing agent", { status: 400 });
    }

    const detail = await getAgentDetailData(agentId, searchParams);

    if (!detail) {
      return new Response("Not found", { status: 404 });
    }

    title = `${detail.agent.name} summary`;
    filename = `agent-${detail.agent.id}-summary.pdf`;
    lines = [
      `Client: ${detail.agent.clientName}`,
      `Window: ${detail.filters.startDate} to ${detail.filters.endDate}`,
      `Granularity: ${detail.granularity}`,
      `Total interactions: ${formatMetric(detail.overview.totalInteractions, 0)}`,
      `Interactions per hour worked: ${formatMetric(detail.overview.interactionsPerHourWorked)}`,
      `Average first reply: ${formatMetric(detail.overview.avgFirstReplyMinutes)}`,
      `Average full resolution: ${formatMetric(detail.overview.avgFullResolutionMinutes)}`,
      `Peer rank: ${detail.peers.rank ?? "No data"}`,
      ...detail.trends.volume.slice(-4).map(
        (point) => `${point.date} - ${formatMetric(point.interactions, 0)} interactions / ${formatMetric(point.hoursWorked)} hours`
      )
    ];
  } else if (report === "client-detail") {
    const clientId = request.nextUrl.searchParams.get("client");

    if (!clientId || clientId === "all") {
      return new Response("Missing client", { status: 400 });
    }

    const detail = await getClientDetailData(clientId, searchParams);

    if (!detail) {
      return new Response("Not found", { status: 404 });
    }

    title = `${detail.client.name} summary`;
    filename = `client-${detail.client.id}-summary.pdf`;
    lines = [
      `Window: ${detail.filters.startDate} to ${detail.filters.endDate}`,
      `Granularity: ${detail.granularity}`,
      `Total interactions: ${formatMetric(detail.overview.totalInteractions, 0)}`,
      `Interactions per hour worked: ${formatMetric(detail.overview.interactionsPerHourWorked)}`,
      `Average first reply: ${formatMetric(detail.overview.avgFirstReplyMinutes)}`,
      `Average full resolution: ${formatMetric(detail.overview.avgFullResolutionMinutes)}`,
      `Capacity status: ${detail.portfolioContext?.capacityLabel ?? "No data"}`,
      ...detail.agents.rows.slice(0, 5).map(
        (row, index) =>
          `${index + 1}. ${row.agentName} - ${formatMetric(row.totalInteractions, 0)} interactions, ${formatMetric(row.interactionsPerHourWorked)} int/hr`
      )
    ];
  } else {
    const dashboard = await getDashboardData(searchParams);
    title = "Dashboard overview summary";
    filename = "dashboard-overview-summary.pdf";
    lines = [
      `Window: ${dashboard.filters.startDate} to ${dashboard.filters.endDate}`,
      `Client filter: ${dashboard.filters.clientId}`,
      `Agent filter: ${dashboard.filters.agentId}`,
      `Total interactions: ${formatMetric(dashboard.overview.totalInteractions, 0)}`,
      `Interactions per hour worked: ${formatMetric(dashboard.overview.interactionsPerHourWorked)}`,
      `Average first reply: ${formatMetric(dashboard.overview.avgFirstReplyMinutes)}`,
      `Average full resolution: ${formatMetric(dashboard.overview.avgFullResolutionMinutes)}`,
      ...dashboard.trends.volume.slice(-5).map(
        (point) => `${point.date} - ${formatMetric(point.interactions, 0)} interactions / ${formatMetric(point.hoursWorked)} hours`
      )
    ];
  }

  const pdf = createSimplePdf(title, lines);

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
