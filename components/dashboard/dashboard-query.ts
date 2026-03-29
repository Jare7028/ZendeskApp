import type { Route } from "next";

type QueryValue = string | null | undefined;

export function buildDashboardHref(
  currentParams: Record<string, QueryValue>,
  updates: Record<string, QueryValue>
): Route {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...currentParams, ...updates })) {
    if (value && value !== "all") {
      params.set(key, value);
    } else if (value === "all" && (key === "client" || key === "agent")) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return (query ? `/dashboard?${query}` : "/dashboard") as Route;
}
