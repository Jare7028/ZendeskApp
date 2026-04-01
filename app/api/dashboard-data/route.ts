import { NextResponse } from "next/server";

import { loadDashboardTabData } from "@/lib/dashboard-tab-data";

export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown, fallbackStatus = 500) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message === "Unauthorized" ? 401 : fallbackStatus;

  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const payload = await loadDashboardTabData({
      dateRange: {
        start: url.searchParams.get("start") ?? "",
        end: url.searchParams.get("end") ?? ""
      },
      hardFilters: {
        clientId: url.searchParams.get("client") ?? "all"
      }
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
