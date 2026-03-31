import "server-only";

import { getDashboardData, type DashboardData } from "@/lib/metrics/dashboard";

type DashboardTabDataWindow = {
  current: DashboardData;
  previous: DashboardData | null;
};

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export async function loadDashboardTabData(dateRange: { start: string; end: string }): Promise<DashboardTabDataWindow> {
  const current = await getDashboardData({
    start: dateRange.start,
    end: dateRange.end
  });
  const currentStart = new Date(`${current.filters.startDate}T00:00:00.000Z`);
  const currentEnd = new Date(`${current.filters.endDate}T00:00:00.000Z`);
  const rangeDays = Math.max(
    1,
    Math.round((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );
  const previous = await getDashboardData({
    start: formatISODate(addDays(currentStart, -rangeDays)),
    end: formatISODate(addDays(currentStart, -1))
  });

  return { current, previous };
}

export type { DashboardTabDataWindow };
