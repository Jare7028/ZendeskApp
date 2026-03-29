"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function DashboardError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="The dashboard query failed. Retry after checking the current connections and sync state."
      reset={reset}
      title="Dashboard unavailable"
    />
  );
}
