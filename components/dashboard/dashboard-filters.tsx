import { DashboardViewSwitcher } from "@/components/dashboard/dashboard-view-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { type DashboardView, type TrendGranularity } from "@/lib/metrics/dashboard";

import { GranularityToggle } from "./granularity-toggle";

type ClientOption = {
  id: string;
  name: string;
};

type AgentOption = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
};

const VIEW_COPY: Record<DashboardView, { label: string; description: string }> = {
  overview: {
    label: "Portfolio overview",
    description: "Navigate intake, service, and staffing at the portfolio level before drilling into clients or agents."
  },
  clients: {
    label: "Client comparison",
    description: "Compare client portfolios inside the selected scope to understand where support effort is easiest or hardest."
  },
  agents: {
    label: "Agent analysis",
    description: "Review individual agent workload and outcomes with the same date and portfolio scope applied."
  }
};

export function DashboardFilters({
  role,
  filters,
  clients,
  agents,
  view,
  queryState
}: {
  role: string;
  filters: {
    startDate: string;
    endDate: string;
    clientId: string;
    agentId: string;
  };
  clients: ClientOption[];
  agents: AgentOption[];
  view: DashboardView;
    queryState: {
      start: string;
      end: string;
      client: string;
      agent: string;
      view: string;
      section?: string;
      granularity: string;
      agentSort: string;
      agentDir: string;
    clientSort: string;
    clientDir: string;
  };
}) {
  const selectedClient =
    filters.clientId === "all" ? null : clients.find((client) => client.id === filters.clientId)?.name ?? "Selected client";
  const selectedAgent =
    filters.agentId === "all" ? null : agents.find((agent) => agent.id === filters.agentId)?.name ?? "Selected agent";
  const viewCopy = VIEW_COPY[view];

  return (
    <Card className="border-primary/10 bg-card/95 shadow-panel">
      <CardHeader className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] xl:items-start">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{role}</Badge>
              <Badge className="border border-border/70 bg-background text-foreground">{viewCopy.label}</Badge>
              {selectedClient ? <Badge className="bg-muted text-foreground">{selectedClient}</Badge> : null}
              {selectedAgent ? <Badge className="bg-muted text-foreground">{selectedAgent}</Badge> : null}
            </div>
            <CardTitle className="text-3xl">Analytics workspace</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6">
              {viewCopy.description}
            </CardDescription>
          </div>
          <div className="rounded-[24px] border border-border/60 bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current scope</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Date window</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {filters.startDate} to {filters.endDate}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Focus</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {selectedAgent ?? selectedClient ?? "All permitted clients and agents"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Trend resolution</p>
                <div className="mt-2">
                  <GranularityToggle granularity={queryState.granularity as TrendGranularity} params={queryState} pathname="/dashboard" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Analysis modes</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Switch between portfolio, client, and agent views without losing the current filter context.
            </p>
          </div>
          <DashboardViewSwitcher params={queryState} view={view} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardDescription>
            Configure the active analytics view with a date window and optional client or agent focus. These controls
            reshape the current workspace instead of creating separate saved reports.
          </CardDescription>
        </div>
        <form className="grid gap-4 lg:grid-cols-5">
          <input name="view" type="hidden" value={queryState.view} />
          <input name="section" type="hidden" value={queryState.section ?? "operations"} />
          <input name="granularity" type="hidden" value={queryState.granularity} />
          <input name="agentSort" type="hidden" value={queryState.agentSort} />
          <input name="agentDir" type="hidden" value={queryState.agentDir} />
          <input name="clientSort" type="hidden" value={queryState.clientSort} />
          <input name="clientDir" type="hidden" value={queryState.clientDir} />
          <div className="space-y-2">
            <Label htmlFor="start">Start date</Label>
            <input
              className="flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={filters.startDate}
              id="start"
              name="start"
              type="date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end">End date</Label>
            <input
              className="flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={filters.endDate}
              id="end"
              name="end"
              type="date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client">Client</Label>
            <select
              className="flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={filters.clientId}
              id="client"
              name="client"
            >
              <option value="all">All permitted clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent">Agent</Label>
            <select
              className="flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={filters.agentId}
              id="agent"
              name="agent"
            >
              <option value="all">All agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {filters.clientId === "all" ? `${agent.name} · ${agent.clientName}` : agent.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" type="submit">
              Update view
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
