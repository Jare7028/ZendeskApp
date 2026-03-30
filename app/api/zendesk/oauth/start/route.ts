import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/session";
import { beginZendeskOAuth } from "@/lib/zendesk/oauth";

function redirectToConnections(request: Request, status: string) {
  const url = new URL("/connections", request.url);
  url.searchParams.set("connection", status);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (context.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const url = new URL(request.url);
  const connectionId = url.searchParams.get("connection_id");

  if (!connectionId) {
    return redirectToConnections(request, "missing-connection");
  }

  try {
    const authorizeUrl = await beginZendeskOAuth(connectionId);
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Zendesk OAuth start error";
    const response = redirectToConnections(request, "oauth-start-failed");
    response.headers.set("x-zendesk-oauth-start-error", detail);
    return response;
  }
}
