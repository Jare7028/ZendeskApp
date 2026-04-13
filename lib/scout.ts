import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const SCOUT_STATUSES = ["active", "watchlist", "contacted", "ignore"] as const;
export type ScoutStatus = (typeof SCOUT_STATUSES)[number];

export type ScoutJob = {
  id: string;
  company_name: string;
  role_title: string;
  location_text: string | null;
  employment_type: string | null;
  compensation_text: string | null;
  source_name: string | null;
  source_url: string | null;
  role_summary: string | null;
  status: ScoutStatus;
  ignore_reason: string | null;
  ignored_at: string | null;
  contacted_at: string | null;
  status_updated_at: string;
  created_at: string;
  updated_at: string;
};

function normalizeStatus(status?: string | null): ScoutStatus | undefined {
  if (!status) return undefined;
  return SCOUT_STATUSES.includes(status as ScoutStatus) ? (status as ScoutStatus) : undefined;
}

export async function listScoutJobs(filters?: { query?: string; status?: string }) {
  const supabase = createServerSupabaseClient().schema("app");
  const query = String(filters?.query ?? "").trim();
  const status = normalizeStatus(filters?.status);

  let request = supabase
    .from("role_scout_jobs")
    .select(
      "id, company_name, role_title, location_text, employment_type, compensation_text, source_name, source_url, role_summary, status, ignore_reason, ignored_at, contacted_at, status_updated_at, created_at, updated_at"
    )
    .order("status_updated_at", { ascending: false });

  if (query) {
    request = request.or(
      `company_name.ilike.%${query}%,role_title.ilike.%${query}%,location_text.ilike.%${query}%,source_name.ilike.%${query}%`
    );
  }

  if (status) {
    request = request.eq("status", status);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ScoutJob[];
}
