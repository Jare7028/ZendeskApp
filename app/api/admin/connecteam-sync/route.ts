import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/session";
import { runConnecteamSyncJob } from "@/lib/connecteam/sync";

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
    return redirectToAdmin(request, "connecteam-missing-connection");
  }

  if (action === "run_incremental") {
    await runConnecteamSyncJob({
      connectionId,
      trigger: "manual"
    });

    return redirectToAdmin(request, "connecteam-incremental-started");
  }

  return redirectToAdmin(request, "connecteam-unknown-action");
}
