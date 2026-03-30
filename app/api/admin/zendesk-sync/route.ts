import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/session";
import { runZendeskSyncJob, startZendeskBackfill } from "@/lib/zendesk/sync";

function redirectToAdmin(request: Request, message: string) {
  const url = new URL("/admin", request.url);
  url.searchParams.set("sync", message);
  return NextResponse.redirect(url);
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (context.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const action = formData.get("action");
  const connectionId = formData.get("connection_id");

  if (typeof connectionId !== "string" || !connectionId) {
    return redirectToAdmin(request, "missing-connection");
  }

  if (action === "run_incremental") {
    await runZendeskSyncJob({
      connectionId,
      trigger: "manual",
      mode: "incremental"
    });

    return redirectToAdmin(request, "incremental-started");
  }

  if (action === "start_backfill") {
    await startZendeskBackfill({
      connectionId,
      trigger: "manual",
      backfillPageBudget: 2
    });

    return redirectToAdmin(request, "backfill-started");
  }

  if (action === "restart_backfill") {
    await startZendeskBackfill({
      connectionId,
      trigger: "manual",
      reset: true,
      backfillPageBudget: 2
    });

    return redirectToAdmin(request, "backfill-restarted");
  }

  return redirectToAdmin(request, "unknown-action");
}
