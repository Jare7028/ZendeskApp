import { redirect } from "next/navigation";

import { DashboardBuilderShell } from "@/components/dashboard/dashboard-builder-shell";
import { getCurrentUserContext } from "@/lib/auth/session";
import { loadDashboardBuilderConfig } from "@/lib/dashboard-builder";
import { getDashboardData } from "@/lib/metrics/dashboard";

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export default async function DashboardPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  const [record, dashboardData] = await Promise.all([loadDashboardBuilderConfig(), getDashboardData()]);
  const currentStart = new Date(`${dashboardData.filters.startDate}T00:00:00.000Z`);
  const currentEnd = new Date(`${dashboardData.filters.endDate}T00:00:00.000Z`);
  const rangeDays = Math.max(
    1,
    Math.round((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );
  const previousData = await getDashboardData({
    start: formatISODate(addDays(currentStart, -rangeDays)),
    end: formatISODate(addDays(currentStart, -1))
  });

  return (
    <DashboardBuilderShell
      initialDashboardData={dashboardData}
      initialRecord={record}
      previousDashboardData={previousData}
    />
  );
}
