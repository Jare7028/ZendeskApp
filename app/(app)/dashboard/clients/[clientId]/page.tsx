import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AgentLeaderboardTable } from "@/components/dashboard/agent-leaderboard-table";
import { formatMinutes, formatNumber, formatPercent } from "@/components/dashboard/dashboard-format";
import { ExportControls } from "@/components/dashboard/export-controls";
import { GranularityToggle } from "@/components/dashboard/granularity-toggle";
import { LineChartCard } from "@/components/dashboard/line-chart-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ServiceLevelCard } from "@/components/dashboard/service-level-card";
import { buildDashboardHref, buildHref } from "@/components/dashboard/dashboard-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getClientDetailData, type DashboardSearchParams } from "@/lib/metrics/dashboard";

export default async function ClientDetailPage({
  params,
  searchParams
}: {
  params: { clientId: string };
  searchParams?: DashboardSearchParams;
}) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  const detail = await getClientDetailData(params.clientId, searchParams);

  if (!detail) {
    notFound();
  }

  const baseParams = {
    start: detail.filters.startDate,
    end: detail.filters.endDate,
    client: detail.filters.clientId,
    agent: detail.filters.agentId,
    view: "clients",
    granularity: detail.granularity,
    agentSort: detail.agents.sort.key,
    agentDir: detail.agents.sort.direction,
    clientSort: "totalInteractions",
    clientDir: "desc"
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-3">
          <Link
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            href={buildDashboardHref(baseParams, { client: "all", agent: "all" })}
          >
            Back to dashboard
          </Link>
          <div className="space-y-2">
            <Badge>Client detail</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">{detail.client.name}</h1>
            <p className="text-sm text-muted-foreground">
              Headline metrics, trends, and agent performance for the selected client.
            </p>
          </div>
        </div>
        <ExportControls
          csvHref={buildHref("/api/dashboard/export/csv", baseParams, { report: "client-detail" })}
          pdfHref={buildHref("/api/dashboard/export/pdf", baseParams, { report: "client-detail" })}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total interactions"
          value={formatNumber(detail.overview.totalInteractions, 0)}
          description="Client ticket volume captured inside the current date range."
        />
        <MetricCard
          title="Interactions per hour worked"
          value={formatNumber(detail.overview.interactionsPerHourWorked, 2)}
          description="Throughput built from interactions divided by hours worked."
        />
        <MetricCard
          title="Utilisation"
          value={formatPercent(detail.overview.agentUtilisationRatio)}
          description="Activity hours divided by total hours for the client team."
        />
        <MetricCard
          title="Replies per ticket"
          value={formatNumber(detail.overview.repliesPerTicket, 2)}
          description="Average reply count per ticket in the selected window."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <Card className="border-primary/10 bg-card/95">
          <CardHeader>
            <CardTitle>Portfolio context</CardTitle>
            <CardDescription>
              This client remains scoped to the same visible-client rules used on the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Capacity</p>
              <p className="mt-2 text-2xl font-semibold">{detail.portfolioContext?.capacityLabel ?? "No data"}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">First reply</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatMinutes(detail.portfolioContext?.avgFirstReplyMinutes ?? null)}
              </p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Utilisation</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatPercent(detail.portfolioContext?.utilisation ?? null)}
              </p>
            </div>
          </CardContent>
        </Card>
        <GranularityToggle granularity={detail.granularity} params={baseParams} pathname={`/dashboard/clients/${detail.client.id}`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ServiceLevelCard
          average={detail.overview.avgFirstReplyMinutes}
          description={`${detail.granularity} trend summary`}
          median={detail.overview.medianFirstReplyMinutes}
          p90={detail.overview.p90FirstReplyMinutes}
          title="First reply time"
        />
        <ServiceLevelCard
          average={detail.overview.avgFullResolutionMinutes}
          description={`${detail.granularity} trend summary`}
          median={detail.overview.medianFullResolutionMinutes}
          p90={detail.overview.p90FullResolutionMinutes}
          title="Full resolution time"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <LineChartCard
          data={detail.trends.volume.map((point) => ({
            date: point.date,
            primary: point.interactions,
            secondary: point.hoursWorked
          }))}
          description={`${detail.granularity} volume against staffing.`}
          primaryColor="#0f766e"
          primaryLabel="Interactions"
          secondaryColor="#d97706"
          secondaryLabel="Hours worked"
          title="Volume trend"
        />
        <LineChartCard
          data={detail.trends.response.map((point) => ({
            date: point.date,
            primary: point.avgFirstReplyMinutes,
            secondary: point.avgFullResolutionMinutes
          }))}
          description={`${detail.granularity} service trend for the selected client.`}
          primaryColor="#0f4c81"
          primaryLabel="Avg first reply"
          secondaryColor="#7c6f64"
          secondaryLabel="Avg full resolution"
          title="Service trend"
        />
      </section>

      <AgentLeaderboardTable params={baseParams} rows={detail.agents.rows} selectedAgentName={null} sort={detail.agents.sort} />
    </div>
  );
}
