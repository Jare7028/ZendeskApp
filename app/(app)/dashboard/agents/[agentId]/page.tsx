import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AgentLeaderboardTable } from "@/components/dashboard/agent-leaderboard-table";
import { formatMinutes, formatNumber, formatPercent } from "@/components/dashboard/dashboard-format";
import { ExportControls } from "@/components/dashboard/export-controls";
import { GranularityToggle } from "@/components/dashboard/granularity-toggle";
import { LineChartCard } from "@/components/dashboard/line-chart-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SlaComplianceCard } from "@/components/dashboard/sla-compliance-card";
import { ServiceLevelCard } from "@/components/dashboard/service-level-card";
import { buildDashboardHref, buildHref } from "@/components/dashboard/dashboard-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getAgentDetailData, type DashboardSearchParams } from "@/lib/metrics/dashboard";

export default async function AgentDetailPage({
  params,
  searchParams
}: {
  params: { agentId: string };
  searchParams?: DashboardSearchParams;
}) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  const detail = await getAgentDetailData(params.agentId, searchParams);

  if (!detail) {
    notFound();
  }

  const baseParams = {
    start: detail.filters.startDate,
    end: detail.filters.endDate,
    client: detail.filters.clientId,
    agent: detail.filters.agentId,
    view: "agents",
    granularity: detail.granularity,
    agentSort: detail.peers.sort.key,
    agentDir: detail.peers.sort.direction,
    clientSort: "totalInteractions",
    clientDir: "desc"
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-3">
          <Link
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            href={buildDashboardHref(baseParams, { agent: "all" })}
          >
            Back to dashboard
          </Link>
          <div className="space-y-2">
            <Badge>{detail.agent.clientName}</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">{detail.agent.name}</h1>
            <p className="text-sm text-muted-foreground">
              Detail view scoped to the active date window and the permitted client portfolio.
            </p>
          </div>
        </div>
        <ExportControls
          csvHref={buildHref("/api/dashboard/export/csv", baseParams, { report: "agent-detail" })}
          pdfHref={buildHref("/api/dashboard/export/pdf", baseParams, { report: "agent-detail" })}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total interactions"
          value={formatNumber(detail.overview.totalInteractions, 0)}
          description="Interactions handled by this agent in the selected window."
        />
        <MetricCard
          title="Interactions per hour worked"
          value={formatNumber(detail.overview.interactionsPerHourWorked, 2)}
          description="Total interactions divided by matched Connecteam hours."
        />
        <MetricCard
          title="Utilisation"
          value={formatPercent(detail.overview.agentUtilisationRatio)}
          description="Scheduled hours on days with work versus total hours."
        />
        <MetricCard
          title="Requester wait time"
          value={formatMinutes(detail.overview.requesterWaitTimeMinutes)}
          description="Average requester wait from the Zendesk metrics payload."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <Card className="border-primary/10 bg-card/95">
          <CardHeader>
            <CardTitle>Comparative context</CardTitle>
            <CardDescription>
              {detail.peers.rank
                ? `Rank ${detail.peers.rank} among agents working ${detail.agent.clientName} in this window.`
                : `No peer ranking is available for ${detail.agent.clientName} in this window.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Client throughput</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(detail.clientContext?.interactionsPerHourWorked ?? null, 2)}
              </p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Client first reply</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatMinutes(detail.clientContext?.avgFirstReplyMinutes ?? null)}
              </p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Client capacity</p>
              <p className="mt-2 text-2xl font-semibold">{detail.clientContext?.capacityLabel ?? "No data"}</p>
            </div>
          </CardContent>
        </Card>
        <GranularityToggle granularity={detail.granularity} params={baseParams} pathname={`/dashboard/agents/${detail.agent.id}`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {detail.sla ? (
          <>
            <SlaComplianceCard
              description={`${detail.agent.clientName} first reply SLA in the current window`}
              metric={detail.sla.firstReply}
              title="Client first reply SLA"
            />
            <SlaComplianceCard
              description={`${detail.agent.clientName} resolution SLA in the current window`}
              metric={detail.sla.fullResolution}
              title="Client resolution SLA"
            />
          </>
        ) : (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>No client SLA configured</CardTitle>
              <CardDescription>
                This agent&apos;s client does not yet have dashboard SLA targets configured.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
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
          description={`${detail.granularity} throughput against scheduled hours.`}
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
          description={`${detail.granularity} response and resolution trend.`}
          primaryColor="#0f4c81"
          primaryLabel="Avg first reply"
          secondaryColor="#7c6f64"
          secondaryLabel="Avg full resolution"
          title="Service trend"
        />
      </section>

      <AgentLeaderboardTable params={baseParams} rows={detail.peers.rows} selectedAgentName={detail.agent.name} sort={detail.peers.sort} />
    </div>
  );
}
