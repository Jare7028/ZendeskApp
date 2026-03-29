"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";

export default function ConnectionsError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState
      description="Connection data could not be loaded. Retry after checking Zendesk and Connecteam credentials."
      reset={reset}
      title="Connections unavailable"
    />
  );
}
