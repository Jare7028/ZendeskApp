import { redirect } from "next/navigation";

import { DashboardBuilderShell } from "@/components/dashboard/dashboard-builder-shell";
import { getCurrentUserContext } from "@/lib/auth/session";
import { loadDashboardBuilderConfig } from "@/lib/dashboard-builder";
import { loadDashboardTabData } from "@/lib/dashboard-tab-data";

export default async function DashboardPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  const record = await loadDashboardBuilderConfig();
  const initialTab = record.config.tabs[0];
  const initialData = initialTab
    ? await loadDashboardTabData({
        dateRange: initialTab.dateRange,
        hardFilters: initialTab.hardFilters
      })
    : null;

  if (!initialTab || !initialData) {
    redirect("/login");
  }

  return (
    <DashboardBuilderShell
      availableClients={initialData.current.visibleClients.map((client) => ({ id: client.id, name: client.name }))}
      initialTabData={initialData}
      initialTabId={initialTab.id}
      initialRecord={record}
    />
  );
}
