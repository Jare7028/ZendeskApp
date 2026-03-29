import "server-only";

import { createHash } from "node:crypto";

import { getCurrentUserContext } from "@/lib/auth/session";
import {
  getResendApiKey,
  getSlaAlertEmailFrom,
  getSlaAlertEmailToOverride
} from "@/lib/config/env";
import { type SlaConfig } from "@/lib/sla/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SlaAlertCandidate = {
  clientId: string;
  clientName: string;
  zendeskConnectionId: string;
  windowStart: string;
  windowEnd: string;
  config: SlaConfig;
  firstReplyCompliance: number | null;
  fullResolutionCompliance: number | null;
  firstReplyMeasuredCount: number;
  fullResolutionMeasuredCount: number;
  breachedMetrics: Array<"first_reply" | "full_resolution">;
};

export type SlaAlertFeedItem = {
  id: string;
  clientId: string;
  zendeskConnectionId: string;
  metricType: "first_reply" | "full_resolution";
  status: "active" | "resolved";
  title: string;
  message: string;
  thresholdPercentage: number;
  compliancePercentage: number | null;
  breachCount: number;
  compliantCount: number;
  windowStart: string;
  windowEnd: string;
  lastEvaluatedAt: string;
  lastNotifiedAt: string | null;
  notificationCount: number;
  emailStatus: string | null;
  emailError: string | null;
};

type SlaAlertEventRow = {
  id: string;
  client_id: string;
  zendesk_connection_id: string;
  metric_type: "first_reply" | "full_resolution";
  status: "active" | "resolved";
  title: string;
  message: string;
  threshold_percentage: number;
  compliance_percentage: number | null;
  breach_count: number;
  compliant_count: number;
  window_start: string;
  window_end: string;
  last_evaluated_at: string;
  last_notified_at: string | null;
  notification_count: number;
  email_status: string | null;
  email_error: string | null;
};

type RoleRow = {
  id: string;
  name: string;
};

type UserRoleAssignmentRow = {
  role_id: string;
  user_id: string;
};

type UserRow = {
  user_id: string;
  email: string | null;
};

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return `${value.toFixed(1)}%`;
}

function buildAlertKey(clientId: string, zendeskConnectionId: string, metricType: "first_reply" | "full_resolution") {
  return createHash("sha1").update(`${clientId}:${zendeskConnectionId}:${metricType}`).digest("hex");
}

function mapFeedItem(row: SlaAlertEventRow): SlaAlertFeedItem {
  return {
    id: row.id,
    clientId: row.client_id,
    zendeskConnectionId: row.zendesk_connection_id,
    metricType: row.metric_type,
    status: row.status,
    title: row.title,
    message: row.message,
    thresholdPercentage: row.threshold_percentage,
    compliancePercentage: row.compliance_percentage,
    breachCount: row.breach_count,
    compliantCount: row.compliant_count,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    lastEvaluatedAt: row.last_evaluated_at,
    lastNotifiedAt: row.last_notified_at,
    notificationCount: row.notification_count,
    emailStatus: row.email_status,
    emailError: row.email_error
  };
}

async function resolveAlertRecipients() {
  const override = getSlaAlertEmailToOverride();

  if (override.length > 0) {
    return override;
  }

  const supabase = createServerSupabaseClient().schema("app");
  const [{ data: roles, error: rolesError }, { data: assignments, error: assignmentsError }, { data: users, error: usersError }] =
    await Promise.all([
      supabase.from("roles").select("id,name"),
      supabase.from("user_role_assignments").select("role_id,user_id"),
      supabase.from("users").select("user_id,email")
    ]);

  if (rolesError || assignmentsError || usersError) {
    return [];
  }

  const adminRoleIds = new Set(
    ((roles ?? []) as RoleRow[]).filter((role) => role.name === "admin").map((role) => role.id)
  );
  const adminUserIds = new Set(
    ((assignments ?? []) as UserRoleAssignmentRow[])
      .filter((assignment) => adminRoleIds.has(assignment.role_id))
      .map((assignment) => assignment.user_id)
  );

  return [...new Set(
    ((users ?? []) as UserRow[])
      .filter((user) => adminUserIds.has(user.user_id))
      .map((user) => user.email?.trim())
      .filter((value): value is string => Boolean(value))
  )];
}

async function sendResendEmail(args: { to: string[]; subject: string; html: string; text: string }) {
  const apiKey = getResendApiKey();
  const from = getSlaAlertEmailFrom();

  if (!apiKey || !from || args.to.length === 0) {
    return { status: "skipped", error: null } as const;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      status: "failed",
      error: (await response.text()).slice(0, 500)
    } as const;
  }

  return { status: "sent", error: null } as const;
}

function buildEmailPayload(candidate: SlaAlertCandidate, metricType: "first_reply" | "full_resolution") {
  const metricLabel = metricType === "first_reply" ? "First reply" : "Full resolution";
  const compliance =
    metricType === "first_reply" ? candidate.firstReplyCompliance : candidate.fullResolutionCompliance;
  const measuredCount =
    metricType === "first_reply" ? candidate.firstReplyMeasuredCount : candidate.fullResolutionMeasuredCount;
  const targetMinutes =
    metricType === "first_reply"
      ? candidate.config.firstReplyTargetMinutes
      : candidate.config.fullResolutionTargetMinutes;
  const compliantCount =
    compliance === null ? 0 : Math.round((compliance / 100) * measuredCount);
  const breachCount = Math.max(measuredCount - compliantCount, 0);

  const subject = `${candidate.clientName}: ${metricLabel} SLA below threshold`;
  const text =
    `${candidate.clientName} ${metricLabel} SLA is below threshold.\n\n` +
    `Compliance: ${formatPercent(compliance)}\n` +
    `Threshold: ${candidate.config.alertThresholdPercent.toFixed(1)}%\n` +
    `Target: ${targetMinutes} minutes\n` +
    `Compliant tickets: ${compliantCount}\n` +
    `Breached tickets: ${breachCount}\n` +
    `Window: ${candidate.windowStart} to ${candidate.windowEnd}\n`;
  const html =
    `<p><strong>${candidate.clientName}</strong> ${metricLabel} SLA is below threshold.</p>` +
    `<ul>` +
    `<li>Compliance: ${formatPercent(compliance)}</li>` +
    `<li>Threshold: ${candidate.config.alertThresholdPercent.toFixed(1)}%</li>` +
    `<li>Target: ${targetMinutes} minutes</li>` +
    `<li>Compliant tickets: ${compliantCount}</li>` +
    `<li>Breached tickets: ${breachCount}</li>` +
    `<li>Window: ${candidate.windowStart} to ${candidate.windowEnd}</li>` +
    `</ul>`;

  return { subject, text, html, metricLabel, compliance, compliantCount, breachCount };
}

async function upsertAlertEvent(candidate: SlaAlertCandidate, metricType: "first_reply" | "full_resolution") {
  const supabase = createServerSupabaseClient().schema("app");
  const alertKey = buildAlertKey(candidate.clientId, candidate.zendeskConnectionId, metricType);
  const { data, error } = await supabase
    .from("sla_alert_events")
    .select("*")
    .eq("alert_key", alertKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const existing = (data ?? null) as SlaAlertEventRow | null;
  const payload = buildEmailPayload(candidate, metricType);
  const nowIso = new Date().toISOString();
  const cooldownMs = candidate.config.cooldownMinutes * 60 * 1000;
  const breachIsActive = candidate.config.alertsEnabled && candidate.breachedMetrics.includes(metricType);
  const shouldNotify =
    breachIsActive &&
    (!existing?.last_notified_at ||
      Date.now() - new Date(existing.last_notified_at).getTime() >= cooldownMs);

  let emailStatus = existing?.email_status ?? null;
  let emailError = existing?.email_error ?? null;
  let notificationCount = existing?.notification_count ?? 0;
  let lastNotifiedAt = existing?.last_notified_at ?? null;

  if (shouldNotify) {
    const recipients = await resolveAlertRecipients();
    const sent = await sendResendEmail({
      to: recipients,
      subject: payload.subject,
      html: payload.html,
      text: payload.text
    });

    emailStatus = sent.status;
    emailError = sent.error;

    if (sent.status === "sent" || sent.status === "skipped") {
      notificationCount += 1;
      lastNotifiedAt = nowIso;
    }
  }

  if (!candidate.config.alertsEnabled) {
    emailStatus = "disabled";
    emailError = null;
  }

  const updatePayload = {
    status: breachIsActive ? "active" : "resolved",
    title: `${candidate.clientName} ${payload.metricLabel} SLA ${breachIsActive ? "breached" : "resolved"}`,
    message: breachIsActive
      ? `${payload.metricLabel} compliance is ${formatPercent(payload.compliance)} against a ${candidate.config.alertThresholdPercent.toFixed(1)}% alert threshold for ${candidate.windowStart} to ${candidate.windowEnd}.`
      : candidate.config.alertsEnabled
        ? `${candidate.clientName} ${payload.metricLabel} SLA is back within threshold for ${candidate.windowStart} to ${candidate.windowEnd}.`
        : `${candidate.clientName} ${payload.metricLabel} alerting is currently disabled for this connection.`,
    threshold_percentage: Number(candidate.config.alertThresholdPercent.toFixed(2)),
    compliance_percentage: payload.compliance === null ? null : Number(payload.compliance.toFixed(2)),
    breach_count: payload.breachCount,
    compliant_count: payload.compliantCount,
    window_start: candidate.windowStart,
    window_end: candidate.windowEnd,
    last_evaluated_at: nowIso,
    last_notified_at: lastNotifiedAt,
    notification_count: notificationCount,
    email_status: emailStatus,
    email_error: emailError
  };

  const result = existing
    ? await supabase.from("sla_alert_events").update(updatePayload).eq("id", existing.id)
    : await supabase.from("sla_alert_events").insert({
        alert_key: alertKey,
        client_id: candidate.clientId,
        zendesk_connection_id: candidate.zendeskConnectionId,
        metric_type: metricType,
        ...updatePayload
      });

  if (result.error) {
    throw result.error;
  }
}

export async function ensureSlaAlertEvents(candidates: SlaAlertCandidate[]) {
  const context = await getCurrentUserContext();

  if (!context || context.role !== "admin") {
    return [] as SlaAlertFeedItem[];
  }

  for (const candidate of candidates) {
    await upsertAlertEvent(candidate, "first_reply");
    await upsertAlertEvent(candidate, "full_resolution");
  }

  return getSlaAlertFeed();
}

export async function getSlaAlertFeed(clientIds?: string[], limit = 8) {
  const context = await getCurrentUserContext();

  if (!context || context.role !== "admin") {
    return [] as SlaAlertFeedItem[];
  }

  const supabase = createServerSupabaseClient().schema("app");
  let query = supabase
    .from("sla_alert_events")
    .select("*")
    .order("last_evaluated_at", { ascending: false })
    .limit(limit);

  if (clientIds && clientIds.length > 0) {
    query = query.in("client_id", clientIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as SlaAlertEventRow[]).map(mapFeedItem);
}
