"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/session";
import { SCOUT_STATUSES, type ScoutStatus } from "@/lib/scout";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function normalizeStatus(value: FormDataEntryValue | null): ScoutStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (!SCOUT_STATUSES.includes(status as ScoutStatus)) {
    redirect("/scout?scout=invalid-status");
  }
  return status as ScoutStatus;
}

async function requireUser() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}

export async function createScoutJobAction(formData: FormData) {
  const context = await requireUser();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const roleTitle = String(formData.get("roleTitle") ?? "").trim();
  const locationText = String(formData.get("locationText") ?? "").trim() || null;
  const sourceName = String(formData.get("sourceName") ?? "").trim() || null;
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || null;
  const roleSummary = String(formData.get("roleSummary") ?? "").trim() || null;
  const compensationText = String(formData.get("compensationText") ?? "").trim() || null;
  const employmentType = String(formData.get("employmentType") ?? "").trim() || null;

  if (!companyName || !roleTitle) {
    redirect("/scout?scout=missing-fields");
  }

  const adminSupabase = createAdminSupabaseClient();
  const { error } = await adminSupabase.from("role_scout_jobs").insert({
    company_name: companyName,
    role_title: roleTitle,
    location_text: locationText,
    source_name: sourceName,
    source_url: sourceUrl,
    role_summary: roleSummary,
    compensation_text: compensationText,
    employment_type: employmentType,
    created_by: context.userId,
    updated_by: context.userId
  });

  if (error) {
    redirect(`/scout?scout=create-failed&detail=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/scout");
  redirect("/scout?scout=created");
}

export async function updateScoutJobStatusAction(formData: FormData) {
  const context = await requireUser();
  const adminSupabase = createAdminSupabaseClient();
  const jobId = String(formData.get("jobId") ?? "").trim();
  const nextStatus = normalizeStatus(formData.get("status"));
  const rawIgnoreReason = String(formData.get("ignoreReason") ?? "").trim();
  const ignoreReason = rawIgnoreReason || null;

  if (!jobId) {
    redirect("/scout?scout=missing-job");
  }

  if (nextStatus === "ignore" && !ignoreReason) {
    redirect("/scout?scout=ignore-reason-required");
  }

  const { data: existing, error: existingError } = await adminSupabase
    .from("role_scout_jobs")
    .select("id,status,ignore_reason")
    .eq("id", jobId)
    .maybeSingle();

  if (existingError || !existing) {
    redirect(`/scout?scout=missing-job&detail=${encodeURIComponent(existingError?.message ?? "Job not found")}`);
  }

  const timestamp = new Date().toISOString();
  const payload = {
    status: nextStatus,
    ignore_reason: nextStatus === "ignore" ? ignoreReason : null,
    ignored_at: nextStatus === "ignore" ? timestamp : null,
    contacted_at: nextStatus === "contacted" ? timestamp : null,
    status_updated_at: timestamp,
    updated_by: context.userId
  };

  const { error: updateError } = await adminSupabase.from("role_scout_jobs").update(payload).eq("id", jobId);

  if (updateError) {
    redirect(`/scout?scout=update-failed&detail=${encodeURIComponent(updateError.message)}`);
  }

  if (existing.status !== nextStatus || (existing.ignore_reason ?? null) !== (payload.ignore_reason ?? null)) {
    const { error: historyError } = await adminSupabase.from("role_scout_job_status_history").insert({
      job_id: jobId,
      previous_status: existing.status,
      next_status: nextStatus,
      ignore_reason: payload.ignore_reason,
      changed_by: context.userId
    });

    if (historyError) {
      redirect(`/scout?scout=history-failed&detail=${encodeURIComponent(historyError.message)}`);
    }
  }

  revalidatePath("/scout");
  redirect("/scout?scout=updated");
}
