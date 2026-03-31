import { NextResponse } from "next/server";

import {
  loadDashboardBuilderConfig,
  normalizeDashboardBuilderConfig,
  saveDashboardBuilderConfig
} from "@/lib/dashboard-builder";

export const dynamic = "force-dynamic";

function toErrorResponse(error: unknown, fallbackStatus = 500) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message === "Unauthorized" ? 401 : fallbackStatus;

  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const record = await loadDashboardBuilderConfig();

    return NextResponse.json(record);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const record = await saveDashboardBuilderConfig(normalizeDashboardBuilderConfig(body));

    return NextResponse.json(record);
  } catch (error) {
    const fallbackStatus =
      error instanceof SyntaxError || (error instanceof Error && error.message.includes("JSON")) ? 400 : 500;

    return toErrorResponse(error, fallbackStatus);
  }
}
