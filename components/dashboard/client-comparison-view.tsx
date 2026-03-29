import Link from "next/link";

import { CapacityBadge } from "@/components/dashboard/capacity-badge";
import { ExportControls } from "@/components/dashboard/export-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ClientComparisonRow,
  type ClientSortKey,
  type SortDirection
} from "@/lib/metrics/dashboard";

import { buildDashboardHref, buildHref } from "./dashboard-query";

function formatNumber(value: number | null, maximumFractionDigits = 1) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatCompliancePercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No target";
  }

  return `${value.toFixed(1)}%`;
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

function nextDirection(currentKey: ClientSortKey, requestedKey: ClientSortKey, currentDirection: SortDirection) {
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
  sortKey: ClientSortKey;
  activeKey: ClientSortKey;
  direction: SortDirection;
  params: Record<string, string>;
}) {
  const isActive = sortKey === activeKey;
  const nextDir = nextDirection(activeKey, sortKey, direction);
  const indicator = isActive ? (direction === "desc" ? " ↓" : " ↑") : "";

  return (
    <Link
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
      href={buildDashboardHref(params, { clientSort: sortKey, clientDir: nextDir, view: "clients" })}
    >
      {label}
      {indicator}
    </Link>
  );
}

function HighlightCard({
  title,
  row,
  description
}: {
  title: string;
  row: ClientComparisonRow | undefined;
  description: string;
}) {
  return (
    <Card className="border-primary/10 bg-card/90">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle>{row?.clientName ?? "Not enough data"}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{row ? description : "Need at least two clients in view to compare difficulty."}</CardContent>
    </Card>
  );
}

export function ClientComparisonView({
  rows,
  sort,
  hardestClientId,
  easiestClientId,
  params
}: {
  rows: ClientComparisonRow[];
  sort: { key: ClientSortKey; direction: SortDirection };
  hardestClientId: string | null;
  easiestClientId: string | null;
  params: Record<string, string>;
}) {
  const hardestClient = rows.find((row) => row.clientId === hardestClientId);
  const easiestClient = rows.find((row) => row.clientId === easiestClientId);
  const csvHref = buildHref("/api/dashboard/export/csv", params, { report: "clients" });
  const pdfHref = buildHref("/api/dashboard/export/pdf", params, { report: "clients" });

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-2">
        <HighlightCard
          description="Composite workload signal inferred from slower first replies, slower resolutions, and weaker throughput."
          row={hardestClient}
          title="Hardest client"
        />
        <HighlightCard
          description="Fast service times and stronger throughput make this the easiest portfolio to absorb right now."
          row={easiestClient}
          title="Easiest client"
        />
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle>Client comparison</CardTitle>
            <CardDescription>
              Side-by-side throughput and service performance for the clients visible to this account.
            </CardDescription>
          </div>
          <ExportControls csvHref={csvHref} pdfHref={pdfHref} />
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No client-level metrics landed in the selected window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th className="px-3 pb-2 text-left">
                      <SortLink activeKey={sort.key} direction={sort.direction} label="Client" params={params} sortKey="client" />
                    </th>
                    <th className="px-3 pb-2 text-right">
                      <SortLink
                        activeKey={sort.key}
                        direction={sort.direction}
                        label="Interactions"
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
                        label="Int/hr"
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
                      <SortLink
                        activeKey={sort.key}
                        direction={sort.direction}
                        label="Utilisation"
                        params={params}
                        sortKey="utilisation"
                      />
                    </th>
                    <th className="px-3 pb-2 text-right">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">SLA</span>
                    </th>
                    <th className="px-3 pb-2 text-right">
                      <SortLink
                        activeKey={sort.key}
                        direction={sort.direction}
                        label="Replies/ticket"
                        params={params}
                        sortKey="repliesPerTicket"
                      />
                    </th>
                    <th className="px-3 pb-2 text-left">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Capacity</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.clientId} className="rounded-2xl bg-muted/35">
                      <td className="rounded-l-2xl px-3 py-3 text-sm font-medium">
                        <a
                          className="underline-offset-4 hover:underline"
                          href={buildHref(`/dashboard/clients/${row.clientId}`, params, {
                            client: row.clientId,
                            agent: "all"
                          })}
                        >
                          {row.clientName}
                        </a>
                      </td>
                      <td className="px-3 py-3 text-right text-sm">{formatNumber(row.totalInteractions, 0)}</td>
                      <td className="px-3 py-3 text-right text-sm">{formatNumber(row.totalHoursWorked, 1)}</td>
                      <td className="px-3 py-3 text-right text-sm">{formatNumber(row.interactionsPerHourWorked, 2)}</td>
                      <td className="px-3 py-3 text-right text-sm">{formatMinutes(row.avgFirstReplyMinutes)}</td>
                      <td className="px-3 py-3 text-right text-sm">{formatMinutes(row.avgFullResolutionMinutes)}</td>
                      <td className="px-3 py-3 text-right text-sm">{formatPercent(row.utilisation)}</td>
                      <td className="px-3 py-3 text-right text-sm">
                        {formatCompliancePercent(
                          row.firstReplyComplianceRate !== null
                            ? Math.min(
                                row.firstReplyComplianceRate,
                                row.fullResolutionComplianceRate ?? row.firstReplyComplianceRate
                              )
                            : row.fullResolutionComplianceRate
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-sm">{formatNumber(row.repliesPerTicket, 2)}</td>
                      <td className="rounded-r-2xl px-3 py-3 text-sm">
                        <CapacityBadge label={row.capacityLabel} tone={row.capacityTone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capacity planning</CardTitle>
          <CardDescription>
            Hours worked versus ticket volume, using the same precomputed metrics as the comparison table.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staffing or volume metrics matched this selection.</p>
          ) : (
            rows.map((row) => (
              <div key={row.clientId} className="rounded-3xl border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{row.clientName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{row.capacityDetail}</p>
                  </div>
                  <CapacityBadge label={row.capacityLabel} tone={row.capacityTone} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-background/80 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Interactions</p>
                    <p className="mt-2 text-xl font-semibold">{formatNumber(row.totalInteractions, 0)}</p>
                  </div>
                  <div className="rounded-2xl bg-background/80 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Hours worked</p>
                    <p className="mt-2 text-xl font-semibold">{formatNumber(row.totalHoursWorked, 1)}</p>
                  </div>
                  <div className="rounded-2xl bg-background/80 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Utilisation</p>
                    <p className="mt-2 text-xl font-semibold">{formatPercent(row.utilisation)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
