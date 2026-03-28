import { NextResponse } from "next/server";

import { getCronSecret } from "@/lib/config/env";
import { runConnecteamSyncJob } from "@/lib/connecteam/sync";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const expectedSecret = getCronSecret();

  if (authorization !== `Bearer ${expectedSecret}` && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runConnecteamSyncJob({
    trigger: "cron"
  });

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results
  });
}
