import { NextResponse } from "next/server";

import { getCronSecret } from "@/lib/config/env";
import { runZendeskSyncJob, startZendeskBackfill } from "@/lib/zendesk/sync";

type TrustedAction = "run_incremental" | "start_backfill" | "restart_backfill";

function isAuthorized(request: Request) {
  const expectedSecret = getCronSecret();
  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");

  return (
    authorization === `Bearer ${expectedSecret}` ||
    headerSecret === expectedSecret ||
    querySecret === expectedSecret
  );
}

async function readTrustedPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      action?: TrustedAction;
      connectionId?: string;
      backfillPageBudget?: number;
    };

    return {
      action: body.action,
      connectionId: body.connectionId,
      backfillPageBudget: body.backfillPageBudget
    };
  }

  const formData = await request.formData();
  const budgetValue = formData.get("backfillPageBudget");
  const parsedBudget =
    typeof budgetValue === "string" && budgetValue.trim()
      ? Number.parseInt(budgetValue, 10)
      : undefined;

  return {
    action: formData.get("action"),
    connectionId: formData.get("connection_id"),
    backfillPageBudget: Number.isFinite(parsedBudget) ? parsedBudget : undefined
  };
}

function normalizeBudget(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 2;
  }

  return Math.floor(value);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runZendeskSyncJob({
    trigger: "cron"
  });

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, connectionId, backfillPageBudget } = await readTrustedPayload(request);

  if (typeof connectionId !== "string" || !connectionId) {
    return NextResponse.json({ error: "Missing connectionId" }, { status: 400 });
  }

  if (action === "run_incremental") {
    const results = await runZendeskSyncJob({
      connectionId,
      trigger: "cron",
      mode: "incremental"
    });

    return NextResponse.json({
      ok: true,
      action,
      processed: results.length,
      results
    });
  }

  if (action === "start_backfill" || action === "restart_backfill") {
    const results = await startZendeskBackfill({
      connectionId,
      trigger: "cron",
      reset: action === "restart_backfill",
      backfillPageBudget: normalizeBudget(backfillPageBudget)
    });

    return NextResponse.json({
      ok: true,
      action,
      processed: results.length,
      results
    });
  }

  return NextResponse.json(
    {
      error: "Unknown action",
      allowedActions: ["run_incremental", "start_backfill", "restart_backfill"]
    },
    { status: 400 }
  );
}
