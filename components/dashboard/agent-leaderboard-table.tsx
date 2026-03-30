import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportControls } from "@/components/dashboard/export-controls";
import {
  type AgentLeaderboardRow,
  type AgentSortKey,
  type SortDirection
} from "@/lib/metrics/dashboard";

import { buildDashboardHref, buildHref } from "./dashboard-query";
import { Sparkline } from "./sparkline";

function formatNumber(value: number | null, maximumFractionDigits = 1) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits
  }).format(value);
}

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  if (value >= 60) {
    return `${(value / 60).toFixed(1)}h`;
  }

  return `${value.toFixed(1)}m`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function nextDirection(currentKey: AgentSortKey, requestedKey: AgentSortKey, currentDirection: SortDirection) {
  if (currentKey !== requestedKey) {
    return "desc";
  }

  return currentDirection === "desc" ? "asc" : "desc";
}

function SortLink({
  label,
  sortKey,
  activeKey,
  direction,
  params
}: {
  label: string;
  sortKey: AgentSortKey;
  activeKey: AgentSortKey;
  direction: SortDirection;
  params: Record<string, string>;
}) {
  const isActive = sortKey === activeKey;
  const nextDir = nextDirection(activeKey, sortKey, direction);
  const indicator = isActive ? (direction === "desc" ? " ↓" : " ↑") : "";

  return (
    <Link
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
      href={buildDashboardHref(params, { agentSort: sortKey, agentDir: nextDir, view: "agents" })}
    >
      {label}
      {indicator}
    </Link>
  );
}

export function AgentLeaderboardTable({
  rows,
  sort,
  selectedAgentName,
  params
}: {
  rows: AgentLeaderboardRow[];
  sort: { key: AgentSortKey; direction: SortDirection };
  selectedAgentName: string | null;
  params: Record<string, string>;
}) {
  const csvHref = buildHref("/api/dashboard/export/csv", params, { report: "leaderboard" });
  const pdfHref = buildHref("/api/dashboard/export/pdf", params, { report: "leaderboard" });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <CardTitle>{selectedAgentName ? `${selectedAgentName} leaderboard snapshot` : "Agent leaderboard"}</CardTitle>
          <CardDescription>
            Ranked agent performance for the selected window. Ticket volume and ticket-per-hour are shown separately from reply workload.
          </CardDescription>
        </div>
        <ExportControls csvHref={csvHref} pdfHref={pdfHref} />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent activity matched the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th className="px-3 pb-2 text-left">
                    <SortLink activeKey={sort.key} direction={sort.direction} label="Agent" params={params} sortKey="name" />
                  </th>
                  <th className="px-3 pb-2 text-left">
                    <SortLink activeKey={sort.key} direction={sort.direction} label="Client" params={params} sortKey="client" />
                  </th>
                  <th className="px-3 pb-2 text-right">
                    <SortLink
                      activeKey={sort.key}
                      direction={sort.direction}
                        label="Tickets"
                      params={params}
                      sortKey="totalInteractions"
                    />
                  </th>
                  <th className="px-3 pb-2 text-right">
                    <SortLink activeKey={sort.key} direction={sort.direction} label="Hours" params={params} sortKey="hoursWorked" />
                  </th>
                  <th className="px-3 pb-2 text-right">
                    <SortLink
                      activeKey={sort.key}
                      direction={sort.direction}
                        label="Tkt/hr"
                      params={params}
                      sortKey="interactionsPerHourWorked"
                    />
                  </th>
                  <th className="px-3 pb-2 text-right">
                    <SortLink
                      activeKey={sort.key}
                      direction={sort.direction}
                      label="First reply"
                      params={params}
                      sortKey="avgFirstReplyMinutes"
                    />
                  </th>
                  <th className="px-3 pb-2 text-right">
                    <SortLink
                      activeKey={sort.key}
                      direction={sort.direction}
                      label="Resolution"
                      params={params}
                      sortKey="avgFullResolutionMinutes"
                    />
                  </th>
                  <th className="px-3 pb-2 text-right">
                    <SortLink activeKey={sort.key} direction={sort.direction} label="Reopens" params={params} sortKey="reopens" />
                  </th>
                  <th className="px-3 pb-2 text-right">
                    <SortLink
                      activeKey={sort.key}
                      direction={sort.direction}
                      label="Utilisation"
                      params={params}
                      sortKey="utilisation"
                    />
                  </th>
                  <th className="px-3 pb-2 text-left">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Trend</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.agentId} className="rounded-2xl bg-muted/35">
                    <td className="rounded-l-2xl px-3 py-3 text-sm">
                      <a
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                        href={buildHref(`/dashboard/agents/${row.agentId}`, params, {
                          client: row.clientId,
                          agent: row.agentId
                        })}
                      >
                        {index + 1}. {row.agentName}
                      </a>
                    </td>
                    <td className="px-3 py-3 text-sm text-muted-foreground">{row.clientName}</td>
                    <td className="px-3 py-3 text-right text-sm font-medium">{formatNumber(row.totalInteractions, 0)}</td>
                    <td className="px-3 py-3 text-right text-sm">{formatNumber(row.totalHoursWorked, 1)}</td>
                    <td className="px-3 py-3 text-right text-sm">{formatNumber(row.interactionsPerHourWorked, 2)}</td>
                    <td className="px-3 py-3 text-right text-sm">{formatMinutes(row.avgFirstReplyMinutes)}</td>
                    <td className="px-3 py-3 text-right text-sm">{formatMinutes(row.avgFullResolutionMinutes)}</td>
                    <td className="px-3 py-3 text-right text-sm">{formatNumber(row.totalReopens, 0)}</td>
                    <td className="px-3 py-3 text-right text-sm">{formatPercent(row.utilisation)}</td>
                    <td className="rounded-r-2xl px-3 py-3"><Sparkline values={row.sparkline} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
