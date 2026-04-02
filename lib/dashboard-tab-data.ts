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

function buildDefaultTabDateRange(): DashboardTabDateRange {
  const today = new Date();
  return {
    start: formatISODate(addDays(today, -27)),
    end: formatISODate(today)
  };
}

function isISODateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTabDateRange(dateRange: DashboardTabDateRange): DashboardTabDateRange {
  const fallback = buildDefaultTabDateRange();
  const start = isISODateString(dateRange.start) ? dateRange.start : fallback.start;
  const end = isISODateString(dateRange.end) ? dateRange.end : fallback.end;

  return start <= end ? { start, end } : { start: end, end: start };
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
  const normalizedDateRange = normalizeTabDateRange(request.dateRange);
  const currentSearchParams = buildDashboardSearchParams({
    ...request,
    dateRange: normalizedDateRange
  });
  const currentStart = new Date(`${normalizedDateRange.start}T00:00:00.000Z`);
  const currentEnd = new Date(`${normalizedDateRange.end}T00:00:00.000Z`);
  const rangeDays = Math.max(
    1,
    Math.round((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );
  const previousSearchParams = {
    ...currentSearchParams,
    start: formatISODate(addDays(currentStart, -rangeDays)),
    end: formatISODate(addDays(currentStart, -1))
  } satisfies DashboardSearchParams;

  const [current, previous] = await Promise.all([
    getDashboardData(currentSearchParams),
    getDashboardData(previousSearchParams)
  ]);

  return { current, previous };
}

export type { DashboardTabDataWindow };
