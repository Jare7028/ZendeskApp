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
      description="The dashboard builder could not load. Retry after checking the current session and persistence state."
      reset={reset}
      title="Dashboard unavailable"
    />
  );
}
