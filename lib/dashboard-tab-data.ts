import "server-only";

import { type DashboardTabDateRange, type DashboardTabHardFilters } from "@/lib/dashboard-builder";
import { getDashboardData, type DashboardData, type DashboardSearchParams } from "@/lib/metrics/dashboard";

type DashboardTabDataWindow = {
  current: DashboardData;
  previous: DashboardData | null;
};

type DashboardTabDataRequest = {
  dateRange: DashboardTabDateRange;
  hardFilters?: DashboardTabHardFilters;
};

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function buildDashboardSearchParams({ dateRange, hardFilters }: DashboardTabDataRequest): DashboardSearchParams {
  const params: DashboardSearchParams = {
    start: dateRange.start,
    end: dateRange.end
  };

  if (hardFilters?.clientId && hardFilters.clientId !== "all") {
    params.client = hardFilters.clientId;
  }

  return params;
}

export async function loadDashboardTabData(request: DashboardTabDataRequest): Promise<DashboardTabDataWindow> {
  const currentSearchParams = buildDashboardSearchParams(request);
  const current = await getDashboardData(currentSearchParams);
  const currentStart = new Date(`${current.filters.startDate}T00:00:00.000Z`);
  const currentEnd = new Date(`${current.filters.endDate}T00:00:00.000Z`);
  const rangeDays = Math.max(
    1,
    Math.round((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );
  const previous = await getDashboardData({
    ...currentSearchParams,
    start: formatISODate(addDays(currentStart, -rangeDays)),
    end: formatISODate(addDays(currentStart, -1))
  });

  return { current, previous };
}

export type { DashboardTabDataWindow };
