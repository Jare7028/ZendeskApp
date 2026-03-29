import { redirect } from "next/navigation";

import { AgentLeaderboardTable } from "@/components/dashboard/agent-leaderboard-table";
import { ClientComparisonView } from "@/components/dashboard/client-comparison-view";
import { ChannelStackedCard } from "@/components/dashboard/channel-stacked-card";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { ExportControls } from "@/components/dashboard/export-controls";
import { LineChartCard } from "@/components/dashboard/line-chart-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SlaAlertFeed } from "@/components/dashboard/sla-alert-feed";
import { SlaComplianceCard } from "@/components/dashboard/sla-compliance-card";
import { ServiceLevelCard } from "@/components/dashboard/service-level-card";
import { buildHref } from "@/components/dashboard/dashboard-query";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/metrics/dashboard";

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

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  if (value >= 60) {
    return `${(value / 60).toFixed(1)}h`;
  }

  return `${value.toFixed(1)}m`;
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: {
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
}) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  const dashboard = await getDashboardData(searchParams, {
    includeAdminAlerts: context.role === "admin"
  });

  return (
    <div className="space-y-8">
      <DashboardFilters
        agents={dashboard.agentOptions}
        clients={dashboard.visibleClients}
        filters={dashboard.filters}
        queryState={{
          start: dashboard.filters.startDate,
          end: dashboard.filters.endDate,
          client: dashboard.filters.clientId,
          agent: dashboard.filters.agentId,
          view: dashboard.view,
          granularity: dashboard.granularity,
          agentSort: dashboard.leaderboard.sort.key,
          agentDir: dashboard.leaderboard.sort.direction,
          clientSort: dashboard.clients.sort.key,
          clientDir: dashboard.clients.sort.direction
        }}
        role={context.role}
        view={dashboard.view}
      />

      {!dashboard.hasVisibleClients ? (
        <section className="rounded-[28px] border bg-card/90 p-8 shadow-panel">
          <h2 className="text-2xl font-semibold tracking-tight">No client access configured</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            This account does not currently have any visible clients, so there is no dashboard data to query. Admins
            can add client records and viewer assignments from Supabase before returning here.
          </p>
        </section>
      ) : (
        dashboard.view === "agents" ? (
          <AgentLeaderboardTable
            params={{
              start: dashboard.filters.startDate,
              end: dashboard.filters.endDate,
              client: dashboard.filters.clientId,
              agent: dashboard.filters.agentId,
              view: dashboard.view,
              granularity: dashboard.granularity,
              agentSort: dashboard.leaderboard.sort.key,
              agentDir: dashboard.leaderboard.sort.direction,
              clientSort: dashboard.clients.sort.key,
              clientDir: dashboard.clients.sort.direction
            }}
            rows={dashboard.leaderboard.rows}
            selectedAgentName={dashboard.selectedAgent?.name ?? null}
            sort={dashboard.leaderboard.sort}
          />
        ) : dashboard.view === "clients" ? (
          <ClientComparisonView
            hardestClientId={dashboard.clients.hardestClientId}
            easiestClientId={dashboard.clients.easiestClientId}
            params={{
              start: dashboard.filters.startDate,
              end: dashboard.filters.endDate,
              client: dashboard.filters.clientId,
              agent: dashboard.filters.agentId,
              view: dashboard.view,
              granularity: dashboard.granularity,
              agentSort: dashboard.leaderboard.sort.key,
              agentDir: dashboard.leaderboard.sort.direction,
              clientSort: dashboard.clients.sort.key,
              clientDir: dashboard.clients.sort.direction
            }}
            rows={dashboard.clients.rows}
            sort={dashboard.clients.sort}
          />
        ) : (
          <>
          <section className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
              <p className="mt-1 text-sm text-muted-foreground">Headline portfolio metrics for the current date window.</p>
            </div>
            <ExportControls
              csvHref={buildHref("/api/dashboard/export/csv", {
                start: dashboard.filters.startDate,
                end: dashboard.filters.endDate,
                client: dashboard.filters.clientId,
                agent: dashboard.filters.agentId,
                view: dashboard.view,
                granularity: dashboard.granularity,
                agentSort: dashboard.leaderboard.sort.key,
                agentDir: dashboard.leaderboard.sort.direction,
                clientSort: dashboard.clients.sort.key,
                clientDir: dashboard.clients.sort.direction
              }, { report: "overview" })}
              pdfHref={buildHref("/api/dashboard/export/pdf", {
                start: dashboard.filters.startDate,
                end: dashboard.filters.endDate,
                client: dashboard.filters.clientId,
                agent: dashboard.filters.agentId,
                view: dashboard.view,
                granularity: dashboard.granularity,
                agentSort: dashboard.leaderboard.sort.key,
                agentDir: dashboard.leaderboard.sort.direction,
                clientSort: dashboard.clients.sort.key,
                clientDir: dashboard.clients.sort.direction
              }, { report: "overview" })}
            />
          </section>
          {context.role === "admin" ? <SlaAlertFeed alerts={dashboard.alerts} /> : null}
          {dashboard.sla ? (
            <section className="grid gap-4 xl:grid-cols-2">
              <SlaComplianceCard
                description="Client-specific targets rolled into the current portfolio scope."
                metric={dashboard.sla.firstReply}
                targetLabel="Client-specific"
                title="First reply SLA"
              />
              <SlaComplianceCard
                description="Compliance across configured clients in the selected window."
                metric={dashboard.sla.fullResolution}
                targetLabel="Client-specific"
                title="Full resolution SLA"
              />
            </section>
          ) : (
            <section className="rounded-[28px] border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
              SLA targets have not been configured for the visible client scope yet. Admins can add them on the
              Connections page to unlock compliance tracking and alerts.
            </section>
          )}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Interactions per hour worked"
              value={formatNumber(dashboard.overview.interactionsPerHourWorked, 2)}
              description="Headline throughput built from total ticket interactions divided by scheduled Connecteam hours."
            />
            <MetricCard
              title="Total interactions"
              value={formatNumber(dashboard.overview.totalInteractions, 0)}
              description="Tickets handled inside the selected date window after client and agent filters are applied."
            />
            <MetricCard
              title="Agent utilisation"
              value={formatPercent(dashboard.overview.agentUtilisationRatio)}
              description="Scheduled hours on days with ticket activity divided by total scheduled hours."
            />
            <MetricCard
              title="Replies per ticket"
              value={formatNumber(dashboard.overview.repliesPerTicket, 2)}
              description="Average Zendesk replies captured in the synced ticket metric payload."
            />
            <MetricCard
              title="Requester wait time"
              value={formatMinutes(dashboard.overview.requesterWaitTimeMinutes)}
              description="Average requester wait minutes, using Zendesk ticket metric payload requester wait data."
            />
            <MetricCard
              title="Reopens per agent"
              value={formatNumber(dashboard.overview.reopensPerAgent, 2)}
              description="Average reopen count across agents with activity in the selected window."
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <ServiceLevelCard
              average={dashboard.overview.avgFirstReplyMinutes}
              description="Selected-range distribution"
              median={dashboard.overview.medianFirstReplyMinutes}
              p90={dashboard.overview.p90FirstReplyMinutes}
              title="First reply time"
            />
            <ServiceLevelCard
              average={dashboard.overview.avgFullResolutionMinutes}
              description="Selected-range distribution"
              median={dashboard.overview.medianFullResolutionMinutes}
              p90={dashboard.overview.p90FullResolutionMinutes}
              title="Full resolution time"
            />
            <LineChartCard
              data={dashboard.trends.volume.map((point) => ({
                date: point.date,
                primary: point.interactions,
                secondary: point.hoursWorked
              }))}
              description="Daily throughput against scheduled hours worked for the current filter set."
              primaryColor="#0f766e"
              primaryLabel="Interactions"
              secondaryColor="#d97706"
              secondaryLabel="Hours worked"
              title="Volume vs hours"
            />
            <LineChartCard
              data={dashboard.trends.response.map((point) => ({
                date: point.date,
                primary: point.avgFirstReplyMinutes,
                secondary: point.avgFullResolutionMinutes
              }))}
              description="Daily response and resolution averages, read back from precomputed daily rollups."
              primaryColor="#0f4c81"
              primaryLabel="Avg first reply"
              secondaryColor="#7c6f64"
              secondaryLabel="Avg full resolution"
              title="Service trend"
            />
          </section>

          <ChannelStackedCard
            data={dashboard.trends.channel}
            description="Daily interaction mix by channel. Email, chat, phone, and all remaining sources are broken out."
            title="Channel mix over time"
          />
          </>
        )
      )}
    </div>
  );
}
