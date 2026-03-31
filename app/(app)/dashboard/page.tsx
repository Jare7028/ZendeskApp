import { redirect } from "next/navigation";

import { DashboardBuilderShell } from "@/components/dashboard/dashboard-builder-shell";
import { getCurrentUserContext } from "@/lib/auth/session";
import { loadDashboardBuilderConfig } from "@/lib/dashboard-builder";

export default async function DashboardPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  const record = await loadDashboardBuilderConfig();

  return <DashboardBuilderShell initialRecord={record} />;
}
