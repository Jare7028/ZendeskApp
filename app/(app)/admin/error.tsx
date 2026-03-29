"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function AdminError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="Admin data failed to load. Retry after checking sync state and database connectivity."
      reset={reset}
      title="Admin controls unavailable"
    />
  );
}
