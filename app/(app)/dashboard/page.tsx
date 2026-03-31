import { redirect } from "next/navigation";

import { AgentLeaderboardTable } from "@/components/dashboard/agent-leaderboard-table";
import { ClientComparisonView } from "@/components/dashboard/client-comparison-view";
import { ChannelStackedCard } from "@/components/dashboard/channel-stacked-card";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { ExportControls } from "@/components/dashboard/export-controls";
import { GranularityToggle } from "@/components/dashboard/granularity-toggle";
import { LineChartCard } from "@/components/dashboard/line-chart-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { OverviewSectionSwitcher, type OverviewSection } from "@/components/dashboard/overview-section-switcher";
import { SlaAlertFeed } from "@/components/dashboard/sla-alert-feed";
import { SlaComplianceCard } from "@/components/dashboard/sla-compliance-card";
import { ServiceLevelCard } from "@/components/dashboard/service-level-card";
import { buildHref } from "@/components/dashboard/dashboard-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function parseOverviewSection(value: string | undefined): OverviewSection {
  return value === "service" || value === "workforce" ? value : "operations";
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
    section?: string;
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
  const overviewSection = parseOverviewSection(searchParams?.section);
  const baseParams = {
    start: dashboard.filters.startDate,
    end: dashboard.filters.endDate,
    client: dashboard.filters.clientId,
    agent: dashboard.filters.agentId,
    view: dashboard.view,
    section: overviewSection,
    granularity: dashboard.granularity,
    agentSort: dashboard.leaderboard.sort.key,
    agentDir: dashboard.leaderboard.sort.direction,
    clientSort: dashboard.clients.sort.key,
    clientDir: dashboard.clients.sort.direction
  };

  return (
    <div className="space-y-8">
      <DashboardFilters
        agents={dashboard.agentOptions}
        clients={dashboard.visibleClients}
        filters={dashboard.filters}
        queryState={{
          ...baseParams
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
            params={baseParams}
            rows={dashboard.leaderboard.rows}
            selectedAgentName={dashboard.selectedAgent?.name ?? null}
            sort={dashboard.leaderboard.sort}
          />
        ) : dashboard.view === "clients" ? (
          <ClientComparisonView
            hardestClientId={dashboard.clients.hardestClientId}
            easiestClientId={dashboard.clients.easiestClientId}
            params={{
              ...baseParams
            }}
            rows={dashboard.clients.rows}
            sort={dashboard.clients.sort}
          />
        ) : (
          <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="rounded-[32px] border border-border/60 bg-gradient-to-br from-emerald-50 via-background to-amber-50 p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Portfolio overview</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Operational analytics for the current window</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Ticket-created volume, reply workload, service levels, and matched staffing hours are separated so the
                dashboard does not blur ticket counts into reply throughput. Reply and service metrics are still rolled
                against tickets created inside the selected window.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <GranularityToggle granularity={dashboard.granularity} params={baseParams} pathname="/dashboard" />
              <ExportControls
                csvHref={buildHref("/api/dashboard/export/csv", baseParams, { report: "overview" })}
                pdfHref={buildHref("/api/dashboard/export/pdf", baseParams, { report: "overview" })}
              />
            </div>
          </section>
          <OverviewSectionSwitcher params={baseParams} section={overviewSection} />
          {context.role === "admin" ? <SlaAlertFeed alerts={dashboard.alerts} /> : null}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard
              title="Reply workload per hour"
              value={formatNumber(dashboard.overview.repliesPerHourWorked, 2)}
              description="Zendesk reply count from ticket metrics divided by matched Connecteam hours for tickets created in-range."
            />
            <MetricCard
              title="Ticket intake per hour"
              value={formatNumber(dashboard.overview.interactionsPerHourWorked, 2)}
              description="Tickets created in the selected window divided by matched hours. Use this for intake load, not reply throughput."
            />
            <MetricCard
              title="Tickets created"
              value={formatNumber(dashboard.overview.totalInteractions, 0)}
              description="Zendesk tickets created inside the selected date window after client and agent filters."
            />
            <MetricCard
              title="Replies on those tickets"
              value={formatNumber(dashboard.overview.totalReplies, 0)}
              description="Reply events captured from the synced Zendesk ticket metrics payload for the same in-range ticket set."
            />
            <MetricCard
              title="Active-day utilisation"
              value={formatPercent(dashboard.overview.agentUtilisationRatio)}
              description="Matched hours on days with at least one attributed in-range ticket divided by all matched hours."
            />
            <MetricCard
              title="Replies per ticket"
              value={formatNumber(dashboard.overview.repliesPerTicket, 2)}
              description="Average Zendesk replies captured in ticket metrics for tickets created in the selected window."
            />
          </section>

          {overviewSection === "operations" ? (
            <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <LineChartCard
                data={dashboard.trends.volume.map((point) => ({
                  date: point.date,
                  primary: point.interactions,
                  secondary: point.hoursWorked
                }))}
                description="Hover the chart to inspect how tickets created and staffed hours moved together across the selected periods."
                primaryColor="#0f766e"
                primaryLabel="Tickets created"
                secondaryColor="#d97706"
                secondaryLabel="Hours worked"
                title="Ticket intake vs staffed hours"
              />
              <Card className="border-border/60 bg-card/95">
                <CardHeader>
                  <CardTitle>Throughput diagnostic</CardTitle>
                  <CardDescription>Why the previous contact KPI could read as obviously wrong.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm text-muted-foreground">
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em]">Previous logic</p>
                    <p className="mt-2 text-foreground">
                      Ticket count was displayed as a per-hour contact metric, which inflates or understates real workload
                      whenever tickets carry multiple replies.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em]">Now separated</p>
                    <p className="mt-2 text-foreground">
                      `Reply workload/hour` uses reply count. `Tickets/hour` remains available as intake load.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <p className="text-xs uppercase tracking-[0.16em]">Current ratio</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {formatNumber(dashboard.overview.repliesPerTicket, 2)}
                    </p>
                    <p className="mt-1">Replies per ticket in the selected scope.</p>
                  </div>
                </CardContent>
              </Card>
            </section>

            <ChannelStackedCard
              data={dashboard.trends.channel}
              description="Daily ticket-created mix by channel. Email, chat, phone, and remaining sources are broken out."
              title="Channel mix over time"
            />
            </>
          ) : null}

          {overviewSection === "service" ? (
            <>
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
            </section>

            <LineChartCard
              data={dashboard.trends.response.map((point) => ({
                date: point.date,
                primary: point.avgFirstReplyMinutes,
                secondary: point.avgFullResolutionMinutes
              }))}
              description="Hover the chart to inspect period-by-period service performance using the same precomputed rollups as the cards."
              primaryColor="#0f4c81"
              primaryLabel="Avg first reply"
              secondaryColor="#7c6f64"
              secondaryLabel="Avg full resolution"
              title="Service trend"
            />
            </>
          ) : null}

          {overviewSection === "workforce" ? (
            <>
            <section className="grid gap-4 xl:grid-cols-3">
              <Card className="border-border/60 bg-card/95">
                <CardHeader>
                  <CardDescription>Coverage</CardDescription>
                  <CardTitle>{formatPercent(dashboard.overview.agentUtilisationRatio)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Hours on days with at least one attributed in-range ticket divided by total matched hours. High
                  numbers mean the team is spending more of its scheduled time on days with ticket demand.
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-card/95">
                <CardHeader>
                  <CardDescription>Wait pressure</CardDescription>
                  <CardTitle>{formatMinutes(dashboard.overview.requesterWaitTimeMinutes)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Average requester wait from the Zendesk metrics payload. Use this with utilisation before reading
                  capacity as purely an hours problem.
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-card/95">
                <CardHeader>
                  <CardDescription>Reopens per active agent</CardDescription>
                  <CardTitle>{formatNumber(dashboard.overview.reopensPerAgent, 2)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Reopens normalised by agents with at least one attributed ticket in the current scope.
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <ClientComparisonView
                hardestClientId={dashboard.clients.hardestClientId}
                easiestClientId={dashboard.clients.easiestClientId}
                params={{ ...baseParams, view: "clients" }}
                rows={dashboard.clients.rows.slice(0, 5)}
                sort={dashboard.clients.sort}
              />
              <AgentLeaderboardTable
                params={{ ...baseParams, view: "agents" }}
                rows={dashboard.leaderboard.rows.slice(0, 5)}
                selectedAgentName={dashboard.selectedAgent?.name ?? null}
                sort={dashboard.leaderboard.sort}
              />
            </section>
            </>
          ) : null}
          </>
        )
      )}
    </div>
  );
}
