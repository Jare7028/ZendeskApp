import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/session";
import { loadDashboardTabData } from "@/lib/dashboard-tab-data";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown error";
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  if (isRecord(error)) {
    return error;
  }

  return { value: String(error) };
}

function toErrorResponse(error: unknown, fallbackStatus = 500) {
  const message = readErrorMessage(error);
  const status = message === "Unauthorized" ? 401 : fallbackStatus;

  console.error("Dashboard data request failed", serializeError(error));

  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentUserContext();

    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
