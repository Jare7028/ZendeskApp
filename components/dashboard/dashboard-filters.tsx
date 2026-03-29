import { DashboardViewSwitcher } from "@/components/dashboard/dashboard-view-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { type DashboardView } from "@/lib/metrics/dashboard";

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
    granularity: string;
    agentSort: string;
    agentDir: string;
    clientSort: string;
    clientDir: string;
  };
}) {
  return (
    <Card className="border-primary/10 bg-card/95">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Badge>{role}</Badge>
          <CardTitle className="text-3xl">Analytics dashboard</CardTitle>
          <CardDescription>
            Daily metrics are recomputed server-side for the selected window, persisted into
            <code> app.computed_metrics </code>
            and then read back into the dashboard.
          </CardDescription>
        </div>
        <DashboardViewSwitcher params={queryState} view={view} />
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 lg:grid-cols-5">
          <input name="view" type="hidden" value={queryState.view} />
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
              Apply filters
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
