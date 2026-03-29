import type { Route } from "next";

type QueryValue = string | null | undefined;

function buildQueryString(values: Record<string, QueryValue>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value && value !== "all") {
      params.set(key, value);
    } else if (value === "all" && (key === "client" || key === "agent")) {
      params.set(key, value);
    }
  }

  return params.toString();
}

export function buildHref(pathname: string, currentParams: Record<string, QueryValue>, updates: Record<string, QueryValue>) {
  const query = buildQueryString({ ...currentParams, ...updates });
  return query ? `${pathname}?${query}` : pathname;
}

export function buildDashboardHref(
  currentParams: Record<string, QueryValue>,
  updates: Record<string, QueryValue>
): Route {
  return buildHref("/dashboard", currentParams, updates) as Route;
}
