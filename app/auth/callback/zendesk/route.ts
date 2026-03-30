import { NextResponse } from "next/server";

import { completeZendeskOAuthCallback } from "@/lib/zendesk/oauth";
import { runZendeskPostOAuthSync } from "@/lib/zendesk/sync";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectUrl = await completeZendeskOAuthCallback({
    state: url.searchParams.get("state"),
    code: url.searchParams.get("code"),
    error: url.searchParams.get("error"),
    errorDescription: url.searchParams.get("error_description")
  }, {
    onConnected: async (connection) => {
      try {
        await runZendeskPostOAuthSync(connection.id);
        return {
          status: "connected-sync-started",
          detail: connection.name
        };
      } catch (error) {
        return {
          status: "connected-sync-failed",
          detail: `${connection.name}: ${error instanceof Error ? error.message : "Unknown sync failure."}`
        };
      }
    }
  });

  return NextResponse.redirect(redirectUrl);
}
