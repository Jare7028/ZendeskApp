import { NextResponse } from "next/server";

import { completeZendeskOAuthCallback } from "@/lib/zendesk/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectUrl = await completeZendeskOAuthCallback({
    state: url.searchParams.get("state"),
    code: url.searchParams.get("code"),
    error: url.searchParams.get("error"),
    errorDescription: url.searchParams.get("error_description")
  });

  return NextResponse.redirect(redirectUrl);
}
