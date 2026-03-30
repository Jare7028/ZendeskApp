import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { type ConnecteamConnectionRow, getConnecteamClient } from "@/lib/connecteam/connection";
import {
  type ConnecteamSchedulerRecord,
  type ConnecteamShiftRecord,
  type ConnecteamUserRecord
} from "@/lib/connecteam/client";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;
type RunTrigger = "cron" | "manual";
type AgentInclusionStatus = "mapped" | "ignored" | "unmapped";

type SyncConnectionOptions = {
  connectionId?: string;
  trigger: RunTrigger;
};

type SyncConnectionRow = ConnecteamConnectionRow & {
  sync_status: "idle" | "running" | "error";
  sync_lock_expires_at: string | null;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  last_sync_status: "succeeded" | "failed" | "partial" | null;
  last_sync_error: string | null;
  users_synced_at: string | null;
  shifts_synced_through: string | null;
};

type SyncRunRow = {
  id: string;
};

type SyncCounts = {
  users: number;
  schedulers: number;
  shifts: number;
  scheduledDays: number;
  mappingsAuto: number;
  mappingsUnmatched: number;
};

type SchedulerAssignmentRow = {
  client_id: string;
  zendesk_connection_id: string;
  connecteam_connection_id: string;
  scheduler_id: string;
  scheduler_name: string | null;
};

type ShiftAssignment = {
  clientId: string;
  zendeskConnectionId: string | null;
  connecteamUserId: string;
  connecteamShiftId: string;
  schedulerId: string;
  schedulerName: string | null;
  startAt: string;
  endAt: string;
  shiftDate: string;
  scheduledMinutes: number;
  rawPayload: ConnecteamShiftRecord;
};

type DailyScheduleRow = {
  clientId: string;
  zendeskConnectionId: string | null;
  connecteamUserId: string;
  workDate: string;
  scheduledMinutes: number;
  shiftCount: number;
};

const SYNC_LOCK_MINUTES = 15;
const SHIFT_OVERLAP_DAYS = 3;
const DEFAULT_FUTURE_WINDOW_DAYS = 90;

function isoNow() {
  return new Date().toISOString();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function maxIso(values: Array<string | null | undefined>) {
  const timestamps = values
    .map((value) => parseIso(value))
    .filter((value): value is number => value !== null);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value: unknown) {
  const email = normalizeString(value);
  return email ? email.toLowerCase() : null;
}

function normalizeId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return normalizeString(value);
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      value = numeric;
    } else {
      const timestamp = Date.parse(trimmed);
      return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  return null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readConnectionTimezone(connection: SyncConnectionRow) {
  const account = asRecord(connection.metadata)?.account;
  const timezone = normalizeString(asRecord(account)?.timezone);
  return timezone ?? "UTC";
}

function readSchedulerId(scheduler: ConnecteamSchedulerRecord) {
  return normalizeId(scheduler.schedulerId ?? scheduler.id);
}

function readSchedulerName(scheduler: ConnecteamSchedulerRecord) {
  return normalizeString(scheduler.name ?? scheduler.title) ?? "Scheduler";
}

function readUserId(record: ConnecteamUserRecord) {
  return normalizeId(record.userId ?? record.id);
}

function readUserFullName(record: ConnecteamUserRecord) {
  const fullName = normalizeString(record.fullName);
  if (fullName) {
    return fullName;
  }

  const first = normalizeString(record.firstName);
  const last = normalizeString(record.lastName);
  return [first, last].filter(Boolean).join(" ").trim() || null;
}

function readShiftId(shift: ConnecteamShiftRecord) {
  return normalizeId(shift.shiftId ?? shift.id);
}

function readShiftStart(shift: ConnecteamShiftRecord) {
  return normalizeTimestamp(shift.startDate ?? shift.startTime);
}

function readShiftEnd(shift: ConnecteamShiftRecord) {
  return normalizeTimestamp(shift.endDate ?? shift.endTime);
}

function readShiftUserIds(shift: ConnecteamShiftRecord) {
  const candidates = new Set<string>();
  const directKeys = [
    shift.userId,
    (shift as Record<string, unknown>).assignedUserId,
    (shift as Record<string, unknown>).employeeId
  ];

  for (const candidate of directKeys) {
    const id = normalizeId(candidate);
    if (id) {
      candidates.add(id);
    }
  }

  const nestedRecords = [
    asRecord((shift as Record<string, unknown>).user),
    asRecord((shift as Record<string, unknown>).assignedUser),
    asRecord((shift as Record<string, unknown>).employee)
  ];

  for (const record of nestedRecords) {
    const id = normalizeId(record?.id ?? record?.userId);
    if (id) {
      candidates.add(id);
    }
  }

  const arrays = [
    asArray((shift as Record<string, unknown>).userIds),
    asArray((shift as Record<string, unknown>).assignedUserIds),
    asArray((shift as Record<string, unknown>).users),
    asArray((shift as Record<string, unknown>).assignees)
  ];

  for (const items of arrays) {
    for (const item of items) {
      const record = asRecord(item);
      const id = normalizeId(record ? record.id ?? record.userId : item);
      if (id) {
        candidates.add(id);
      }
    }
  }

  return [...candidates];
}

function minutesBetween(startAt: string, endAt: string) {
  const startMs = parseIso(startAt);
  const endMs = parseIso(endAt);

  if (startMs === null || endMs === null || endMs <= startMs) {
    return 0;
  }

  return Math.round((endMs - startMs) / (60 * 1000));
}

function getDateFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatLocalDate(date: Date, timeZone: string) {
  const parts = getDateFormatter(timeZone).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function compareDateKeys(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function nextDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return formatLocalDate(date, "UTC");
}

function startOfLocalDate(dateKey: string, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  let low = Date.UTC(year, month - 1, day) - 36 * 60 * 60 * 1000;
  let high = Date.UTC(year, month - 1, day) + 36 * 60 * 60 * 1000;

  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2);
    const midDateKey = formatLocalDate(new Date(mid), timeZone);

    if (compareDateKeys(midDateKey, dateKey) < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return new Date(high);
}

function splitShiftByLocalDay(startAt: string, endAt: string, timeZone: string) {
  const startMs = parseIso(startAt);
  const endMs = parseIso(endAt);

  if (startMs === null || endMs === null || endMs <= startMs) {
    return [] as Array<{ workDate: string; minutes: number }>;
  }

  const slices: Array<{ workDate: string; minutes: number }> = [];
  let cursor = new Date(startMs);

  while (cursor.getTime() < endMs) {
    const workDate = formatLocalDate(cursor, timeZone);
    const nextBoundary = startOfLocalDate(nextDateKey(workDate), timeZone);
    const sliceEndMs = Math.min(nextBoundary.getTime(), endMs);
    const minutes = Math.max(0, Math.round((sliceEndMs - cursor.getTime()) / (60 * 1000)));

    if (minutes > 0) {
      slices.push({ workDate, minutes });
    }

    cursor = new Date(sliceEndMs);
  }

  return slices;
}

function getShiftWindowBounds(connection: SyncConnectionRow) {
  const startDate = getShiftWindowStart(connection);
  const endDate = getShiftWindowEnd();
  return {
    startDate,
    endDate,
    startTime: Math.floor(Date.parse(`${startDate}T00:00:00.000Z`) / 1000),
    endTime: Math.floor(Date.parse(`${endDate}T23:59:59.000Z`) / 1000)
  };
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [
      typeof record.message === "string" ? record.message : null,
      typeof record.details === "string" ? record.details : null,
      typeof record.hint === "string" ? record.hint : null,
      typeof record.code === "string" ? `code=${record.code}` : null
    ].filter((value): value is string => Boolean(value?.trim()));

    if (parts.length > 0) {
      return parts.join(" | ");
    }

    try {
      return JSON.stringify(record);
    } catch {
      return "Unknown Connecteam sync failure.";
    }
  }

  return "Unknown Connecteam sync failure.";
}

async function claimConnection(supabase: AdminSupabaseClient, connectionId: string) {
  const now = new Date();
  await supabase
    .from("connecteam_connections")
    .update({
      sync_status: "idle",
      sync_lock_expires_at: null
    })
    .eq("id", connectionId)
    .lt("sync_lock_expires_at", now.toISOString());

  const { data, error } = await supabase
    .from("connecteam_connections")
    .update({
      sync_status: "running",
      sync_lock_expires_at: addMinutes(now, SYNC_LOCK_MINUTES),
      last_sync_started_at: now.toISOString(),
      last_sync_error: null
    })
    .eq("id", connectionId)
    .neq("sync_status", "running")
    .select(
      "id,client_id,connection_scope,name,credential_type,external_account_id,access_token_encrypted,status,metadata,last_validated_at,last_validation_status,last_validation_error,last_synced_at,sync_status,sync_lock_expires_at,last_sync_started_at,last_sync_completed_at,last_sync_status,last_sync_error,users_synced_at,shifts_synced_through"
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SyncConnectionRow | null;
}

async function createRun(
  supabase: AdminSupabaseClient,
  connection: SyncConnectionRow,
  trigger: RunTrigger
) {
  const { data, error } = await supabase
    .from("connecteam_sync_runs")
    .insert({
      client_id: connection.client_id,
      connecteam_connection_id: connection.id,
      trigger_source: trigger,
      sync_mode: "incremental"
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data as SyncRunRow;
}

async function finalizeRun(
  supabase: AdminSupabaseClient,
  connection: SyncConnectionRow,
  runId: string,
  status: "succeeded" | "failed" | "partial",
  counts: SyncCounts,
  details: Record<string, Json>,
  updates: Partial<SyncConnectionRow>,
  errorMessage?: string
) {
  const completedAt = isoNow();

  const { error: runError } = await supabase
    .from("connecteam_sync_runs")
    .update({
      status,
      counts: {
        users: counts.users,
        schedulers: counts.schedulers,
        shifts: counts.shifts,
        scheduled_days: counts.scheduledDays,
        mappings_auto: counts.mappingsAuto,
        mappings_unmatched: counts.mappingsUnmatched
      },
      details,
      completed_at: completedAt,
      error_message: errorMessage ?? null
    })
    .eq("id", runId);

  if (runError) {
    throw runError;
  }

  const { error: connectionError } = await supabase
    .from("connecteam_connections")
    .update({
      sync_status: status === "failed" ? "error" : "idle",
      sync_lock_expires_at: null,
      last_sync_completed_at: completedAt,
      last_sync_status: status,
      last_sync_error: errorMessage ?? null,
      ...(status !== "failed" ? { last_synced_at: completedAt } : {}),
      ...updates
    })
    .eq("id", connection.id);

  if (connectionError) {
    throw connectionError;
  }
}

async function listEligibleConnections(
  supabase: AdminSupabaseClient,
  connectionId?: string
) {
  let query = supabase
    .from("connecteam_connections")
    .select(
      "id,client_id,connection_scope,name,credential_type,external_account_id,access_token_encrypted,status,metadata,last_validated_at,last_validation_status,last_validation_error,last_synced_at,sync_status,sync_lock_expires_at,last_sync_started_at,last_sync_completed_at,last_sync_status,last_sync_error,users_synced_at,shifts_synced_through"
    )
    .eq("status", "active")
    .order("last_synced_at", { ascending: true, nullsFirst: true });

  if (connectionId) {
    query = query.eq("id", connectionId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as SyncConnectionRow[];
}

async function upsertUsers(
  supabase: AdminSupabaseClient,
  connection: SyncConnectionRow,
  users: ConnecteamUserRecord[]
) {
  if (users.length === 0) {
    return 0;
  }

  const rows = users
    .map((user) => {
      const connecteamUserId = readUserId(user);
      if (!connecteamUserId) {
        return null;
      }

      return {
        client_id: connection.client_id,
        connecteam_connection_id: connection.id,
        connecteam_user_id: connecteamUserId,
        email: normalizeEmail(user.email),
        first_name: normalizeString(user.firstName),
        last_name: normalizeString(user.lastName),
        full_name: readUserFullName(user),
        status: normalizeString(user.status),
        raw_payload: user,
        ingested_at: isoNow()
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return 0;
  }

  const { error } = await supabase.from("connecteam_users").upsert(rows, {
    onConflict: "connecteam_connection_id,connecteam_user_id"
  });

  if (error) {
    throw error;
  }

  return rows.length;
}

async function upsertSchedulers(
  supabase: AdminSupabaseClient,
  connectionId: string,
  schedulers: ConnecteamSchedulerRecord[]
) {
  const rows = schedulers
    .map((scheduler) => {
      const schedulerId = readSchedulerId(scheduler);
      if (!schedulerId) {
        return null;
      }

      return {
        connecteam_connection_id: connectionId,
        scheduler_id: schedulerId,
        scheduler_name: readSchedulerName(scheduler),
        raw_payload: scheduler,
        last_seen_at: isoNow()
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return 0;
  }

  const { error } = await supabase.from("connecteam_schedulers").upsert(rows, {
    onConflict: "connecteam_connection_id,scheduler_id"
  });

  if (error) {
    throw error;
  }

  return rows.length;
}

async function getSchedulerAssignments(
  supabase: AdminSupabaseClient,
  connectionId: string
) {
  const { data, error } = await supabase
    .from("zendesk_connecteam_schedules")
    .select("client_id,zendesk_connection_id,connecteam_connection_id,scheduler_id,scheduler_name")
    .eq("connecteam_connection_id", connectionId);

  if (error) {
    throw error;
  }

  return (data ?? []) as SchedulerAssignmentRow[];
}

function buildShiftAssignments(
  shifts: ConnecteamShiftRecord[],
  scheduler: ConnecteamSchedulerRecord,
  target: {
    clientId: string;
    zendeskConnectionId: string | null;
  }
) {
  const schedulerId = readSchedulerId(scheduler);
  if (!schedulerId) {
    return [] as ShiftAssignment[];
  }

  const schedulerName = readSchedulerName(scheduler);
  const assignments: ShiftAssignment[] = [];

  for (const shift of shifts) {
    const connecteamShiftId = readShiftId(shift);
    const startAt = readShiftStart(shift);
    const endAt = readShiftEnd(shift);
    const userIds = readShiftUserIds(shift);

    if (!connecteamShiftId || !startAt || !endAt || userIds.length === 0) {
      continue;
    }

    const scheduledMinutes = minutesBetween(startAt, endAt);
    if (scheduledMinutes <= 0) {
      continue;
    }

    for (const connecteamUserId of userIds) {
      assignments.push({
        clientId: target.clientId,
        zendeskConnectionId: target.zendeskConnectionId,
        connecteamUserId,
        connecteamShiftId,
        schedulerId,
        schedulerName,
        startAt,
        endAt,
        shiftDate: startAt.slice(0, 10),
        scheduledMinutes,
        rawPayload: shift
      });
    }
  }

  return assignments;
}

async function replaceShiftWindow(
  supabase: AdminSupabaseClient,
  connection: SyncConnectionRow,
  assignments: ShiftAssignment[],
  startDate: string
) {
  const { error: deleteError } = await supabase
    .from("connecteam_shifts")
    .delete()
    .eq("connecteam_connection_id", connection.id)
    .gte("shift_date", startDate);

  if (deleteError) {
    throw deleteError;
  }

  if (assignments.length === 0) {
    return 0;
  }

  const rows = assignments.map((assignment) => ({
    client_id: assignment.clientId,
    zendesk_connection_id: assignment.zendeskConnectionId,
    connecteam_connection_id: connection.id,
    connecteam_user_id: assignment.connecteamUserId,
    connecteam_shift_id: assignment.connecteamShiftId,
    scheduler_id: assignment.schedulerId,
    scheduler_name: assignment.schedulerName,
    start_at: assignment.startAt,
    end_at: assignment.endAt,
    shift_date: assignment.shiftDate,
    scheduled_minutes: assignment.scheduledMinutes,
    raw_payload: assignment.rawPayload,
    ingested_at: isoNow()
  }));

  const { error } = await supabase.from("connecteam_shifts").insert(rows);
  if (error) {
    throw error;
  }

  return rows.length;
}

function aggregateDailySchedules(assignments: ShiftAssignment[], timeZone: string) {
  const aggregates = new Map<string, DailyScheduleRow>();

  for (const assignment of assignments) {
    const daySlices = splitShiftByLocalDay(assignment.startAt, assignment.endAt, timeZone);

    for (const slice of daySlices) {
      const key = `${assignment.connecteamUserId}:${slice.workDate}`;
      const scopedKey = `${assignment.clientId}:${assignment.zendeskConnectionId ?? "none"}:${key}`;
      const existing = aggregates.get(scopedKey);

      if (existing) {
        existing.scheduledMinutes += slice.minutes;
        existing.shiftCount += 1;
        continue;
      }

      aggregates.set(scopedKey, {
        clientId: assignment.clientId,
        zendeskConnectionId: assignment.zendeskConnectionId,
        connecteamUserId: assignment.connecteamUserId,
        workDate: slice.workDate,
        scheduledMinutes: slice.minutes,
        shiftCount: 1
      });
    }
  }

  return [...aggregates.values()];
}

async function replaceDailySchedules(
  supabase: AdminSupabaseClient,
  connection: SyncConnectionRow,
  rows: DailyScheduleRow[],
  startDate: string
) {
  const { error: deleteError } = await supabase
    .from("connecteam_daily_schedules")
    .delete()
    .eq("connecteam_connection_id", connection.id)
    .gte("work_date", startDate);

  if (deleteError) {
    throw deleteError;
  }

  if (rows.length === 0) {
    return 0;
  }

  const payload = rows.map((row) => ({
    client_id: row.clientId,
    zendesk_connection_id: row.zendeskConnectionId,
    connecteam_connection_id: connection.id,
    connecteam_user_id: row.connecteamUserId,
    work_date: row.workDate,
    scheduled_minutes: row.scheduledMinutes,
    shift_count: row.shiftCount,
    source_updated_at: isoNow(),
    raw_payload: {
      connecteam_user_id: row.connecteamUserId,
      work_date: row.workDate,
      scheduled_minutes: row.scheduledMinutes,
      shift_count: row.shiftCount
    }
  }));

  const { error } = await supabase.from("connecteam_daily_schedules").insert(payload);
  if (error) {
    throw error;
  }

  return payload.length;
}

async function syncLegacyTimesheetData(
  supabase: AdminSupabaseClient,
  connection: SyncConnectionRow,
  rows: DailyScheduleRow[],
  startDate: string
) {
  const { error: deleteError } = await supabase
    .from("timesheet_data")
    .delete()
    .eq("connecteam_connection_id", connection.id)
    .gte("work_date", startDate)
    .like("connecteam_timesheet_id", "schedule:%");

  if (deleteError) {
    throw deleteError;
  }

  if (rows.length === 0) {
    return;
  }

  const payload = rows.map((row) => ({
    client_id: row.clientId,
    zendesk_connection_id: row.zendeskConnectionId,
    connecteam_connection_id: connection.id,
    connecteam_timesheet_id: `schedule:${row.clientId}:${row.zendeskConnectionId ?? "none"}:${row.connecteamUserId}:${row.workDate}`,
    work_date: row.workDate,
    minutes_worked: row.scheduledMinutes,
    billable_minutes: null,
    payload: {
      source: "scheduled_shift",
      zendesk_connection_id: row.zendeskConnectionId,
      connecteam_user_id: row.connecteamUserId,
      work_date: row.workDate,
      scheduled_minutes: row.scheduledMinutes,
      shift_count: row.shiftCount
    },
    recorded_at: isoNow()
  }));

  const { error } = await supabase.from("timesheet_data").insert(payload);
  if (error) {
    throw error;
  }
}

async function getZendeskAgents(
  supabase: AdminSupabaseClient,
  clientId: string,
  zendeskConnectionId?: string | null
) {
  let query = supabase
    .from("zendesk_agents")
    .select("client_id,zendesk_connection_id,zendesk_user_id,name,email")
    .eq("client_id", clientId);

  if (zendeskConnectionId) {
    query = query.eq("zendesk_connection_id", zendeskConnectionId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{
    client_id: string;
    zendesk_connection_id: string;
    zendesk_user_id: string;
    name: string | null;
    email: string | null;
  }>;
}

async function getConnecteamUsers(
  supabase: AdminSupabaseClient,
  connectionId: string
) {
  const { data, error } = await supabase
    .from("connecteam_users")
    .select("connecteam_user_id,email,full_name")
    .eq("connecteam_connection_id", connectionId);

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{
    connecteam_user_id: string;
    email: string | null;
    full_name: string | null;
  }>;
}

async function getExistingMappings(
  supabase: AdminSupabaseClient,
  clientId: string,
  connectionId: string,
  zendeskConnectionId?: string | null
) {
  let query = supabase
    .from("agent_mappings")
    .select(
      "id,client_id,zendesk_connection_id,connecteam_connection_id,zendesk_agent_id,connecteam_user_id,display_name,email,zendesk_agent_name,connecteam_user_name,match_source,manual_override,inclusion_status"
    )
    .eq("client_id", clientId)
    .eq("connecteam_connection_id", connectionId);

  if (zendeskConnectionId) {
    query = query.eq("zendesk_connection_id", zendeskConnectionId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{
    id: string;
    client_id: string;
    zendesk_connection_id: string | null;
    connecteam_connection_id: string | null;
    zendesk_agent_id: string | null;
    connecteam_user_id: string | null;
    display_name: string;
    email: string | null;
    zendesk_agent_name: string | null;
    connecteam_user_name: string | null;
    match_source: "auto" | "manual" | "unmatched";
    manual_override: boolean;
    inclusion_status: AgentInclusionStatus;
  }>;
}

async function autoMatchAgents(
  supabase: AdminSupabaseClient,
  connection: SyncConnectionRow,
  targets: Array<{ clientId: string; zendeskConnectionId: string | null }>
) {
  const connecteamUsers = await getConnecteamUsers(supabase, connection.id);
  const uniqueTargets = targets.filter(
    (target, index) =>
      targets.findIndex(
        (candidate) =>
          candidate.clientId === target.clientId && candidate.zendeskConnectionId === target.zendeskConnectionId
      ) === index
  );
  const existingMappings = await Promise.all(
    uniqueTargets.map((target) => getExistingMappings(supabase, target.clientId, connection.id, target.zendeskConnectionId))
  ).then((rows) => rows.flat());

  const connecteamUserByEmail = new Map<string, (typeof connecteamUsers)[number]>();
  for (const user of connecteamUsers) {
    const email = normalizeEmail(user.email);
    if (email && !connecteamUserByEmail.has(email)) {
      connecteamUserByEmail.set(email, user);
    }
  }

  let autoCount = 0;
  let unmatchedCount = 0;
  const manualByZendeskKey = new Map<string, (typeof existingMappings)[number]>();
  const claimedUserIds = new Set<string>();

  for (const mapping of existingMappings) {
    if (mapping.manual_override && mapping.zendesk_connection_id && mapping.zendesk_agent_id) {
      manualByZendeskKey.set(`${mapping.zendesk_connection_id}:${mapping.zendesk_agent_id}`, mapping);
      if (mapping.connecteam_user_id) {
        claimedUserIds.add(mapping.connecteam_user_id);
      }
    }
  }

  for (const target of uniqueTargets) {
    const zendeskAgents = await getZendeskAgents(supabase, target.clientId, target.zendeskConnectionId);
    const rowsToUpsert: Array<Record<string, Json | string | boolean | null>> = [];

    for (const agent of zendeskAgents) {
      const mappingKey = `${agent.zendesk_connection_id}:${agent.zendesk_user_id}`;
      if (manualByZendeskKey.has(mappingKey)) {
        continue;
      }

      const email = normalizeEmail(agent.email);
      const matchedUser = email ? connecteamUserByEmail.get(email) ?? null : null;
      const connecteamUserId =
        matchedUser && !claimedUserIds.has(matchedUser.connecteam_user_id)
          ? matchedUser.connecteam_user_id
          : null;
      const connecteamUserName = connecteamUserId ? matchedUser?.full_name ?? null : null;

      if (connecteamUserId) {
        claimedUserIds.add(connecteamUserId);
        autoCount += 1;
      } else {
        unmatchedCount += 1;
      }

      rowsToUpsert.push({
        client_id: target.clientId,
        zendesk_connection_id: agent.zendesk_connection_id,
        connecteam_connection_id: connection.id,
        zendesk_agent_id: agent.zendesk_user_id,
        connecteam_user_id: connecteamUserId,
        display_name: agent.name ?? connecteamUserName ?? email ?? "Unmapped agent",
        email,
        zendesk_agent_name: agent.name,
        connecteam_user_name: connecteamUserName,
        inclusion_status: connecteamUserId ? "mapped" : "unmapped",
        match_source: connecteamUserId ? "auto" : "unmatched",
        manual_override: false,
        matched_at: isoNow()
      });
    }

    if (rowsToUpsert.length === 0) {
      continue;
    }

    let clearQuery = supabase
      .from("agent_mappings")
      .update({
        connecteam_user_id: null,
        connecteam_user_name: null,
        inclusion_status: "unmapped",
        match_source: "unmatched",
        matched_at: isoNow()
      })
      .eq("client_id", target.clientId)
      .eq("connecteam_connection_id", connection.id)
      .eq("manual_override", false);

    if (target.zendeskConnectionId) {
      clearQuery = clearQuery.eq("zendesk_connection_id", target.zendeskConnectionId);
    }

    const { error: clearError } = await clearQuery;
    if (clearError) {
      throw clearError;
    }

    const { error } = await supabase.from("agent_mappings").upsert(rowsToUpsert, {
      onConflict: "client_id,zendesk_connection_id,zendesk_agent_id"
    });

    if (error) {
      throw error;
    }
  }

  return {
    autoCount,
    unmatchedCount
  };
}

function getShiftWindowStart(connection: SyncConnectionRow) {
  const watermarkMs = parseIso(connection.shifts_synced_through);
  const start = watermarkMs === null ? new Date("2000-01-01T00:00:00.000Z") : addDays(new Date(watermarkMs), -SHIFT_OVERLAP_DAYS);
  return start.toISOString().slice(0, 10);
}

function getShiftWindowEnd() {
  return addDays(new Date(), DEFAULT_FUTURE_WINDOW_DAYS).toISOString().slice(0, 10);
}

async function runConnectionSync(
  supabase: AdminSupabaseClient,
  connectionId: string,
  trigger: RunTrigger
) {
  const connection = await claimConnection(supabase, connectionId);
  if (!connection) {
    return null;
  }

  if (connection.status !== "active" || !connection.access_token_encrypted) {
    await supabase
      .from("connecteam_connections")
      .update({
        sync_status: "error",
        sync_lock_expires_at: null,
        last_sync_error: "Only active Connecteam connections with an API key can be synced."
      })
      .eq("id", connection.id);
    return null;
  }

  const run = await createRun(supabase, connection, trigger);

  try {
    const client = getConnecteamClient(connection.access_token_encrypted);
    const users = await client.listAllUsers();
    const schedulers = await client.listAllSchedulers();
    const schedulerAssignments = await getSchedulerAssignments(supabase, connection.id);
    const shiftWindow = getShiftWindowBounds(connection);
    const assignments: ShiftAssignment[] = [];
    const schedulerById = new Map(
      schedulers
        .map((scheduler) => {
          const schedulerId = readSchedulerId(scheduler);
          return schedulerId ? [schedulerId, scheduler] : null;
        })
        .filter((entry): entry is [string, ConnecteamSchedulerRecord] => entry !== null)
    );

    await upsertSchedulers(supabase, connection.id, schedulers);

    if (schedulerAssignments.length > 0) {
      for (const target of schedulerAssignments) {
        const scheduler = schedulerById.get(target.scheduler_id);
        if (!scheduler) {
          continue;
        }

        const shifts = await client.listAllSchedulerShifts(target.scheduler_id, {
          startTime: shiftWindow.startTime,
          endTime: shiftWindow.endTime
        });
        assignments.push(
          ...buildShiftAssignments(shifts, scheduler, {
            clientId: target.client_id,
            zendeskConnectionId: target.zendesk_connection_id
          })
        );
      }
    } else if (connection.client_id) {
      for (const scheduler of schedulers) {
        const schedulerId = readSchedulerId(scheduler);
        if (!schedulerId) {
          continue;
        }

        const shifts = await client.listAllSchedulerShifts(schedulerId, {
          startTime: shiftWindow.startTime,
          endTime: shiftWindow.endTime
        });
        assignments.push(
          ...buildShiftAssignments(shifts, scheduler, {
            clientId: connection.client_id,
            zendeskConnectionId: null
          })
        );
      }
    }

    const usersCount = await upsertUsers(supabase, connection, users);
    const shiftsCount = await replaceShiftWindow(supabase, connection, assignments, shiftWindow.startDate);
    const dailySchedules = aggregateDailySchedules(assignments, readConnectionTimezone(connection));
    const scheduledDaysCount = await replaceDailySchedules(supabase, connection, dailySchedules, shiftWindow.startDate);
    await syncLegacyTimesheetData(supabase, connection, dailySchedules, shiftWindow.startDate);
    const mappingResult = await autoMatchAgents(
      supabase,
      connection,
      schedulerAssignments.length > 0
        ? schedulerAssignments.map((assignment) => ({
            clientId: assignment.client_id,
            zendeskConnectionId: assignment.zendesk_connection_id
          }))
        : connection.client_id
          ? [{ clientId: connection.client_id, zendeskConnectionId: null }]
          : []
    );

    const maxShiftEndAt = maxIso(assignments.map((assignment) => assignment.endAt));
    const counts: SyncCounts = {
      users: usersCount,
      schedulers: schedulers.length,
      shifts: shiftsCount,
      scheduledDays: scheduledDaysCount,
      mappingsAuto: mappingResult.autoCount,
      mappingsUnmatched: mappingResult.unmatchedCount
    };

    await finalizeRun(
      supabase,
      connection,
      run.id,
      mappingResult.unmatchedCount > 0 ? "partial" : "succeeded",
      counts,
      {
        shift_window_start: shiftWindow.startDate,
        shift_window_end: shiftWindow.endDate,
        timezone: readConnectionTimezone(connection),
        selected_schedulers: schedulerAssignments.map((assignment) => ({
          client_id: assignment.client_id,
          zendesk_connection_id: assignment.zendesk_connection_id,
          scheduler_id: assignment.scheduler_id,
          scheduler_name: assignment.scheduler_name
        }))
      },
      {
        users_synced_at: isoNow(),
        shifts_synced_through: maxShiftEndAt ?? isoNow()
      }
    );

    return {
      runId: run.id,
      counts
    };
  } catch (error) {
    const message = readErrorMessage(error);

    await finalizeRun(
      supabase,
      connection,
      run.id,
      "failed",
      {
        users: 0,
        schedulers: 0,
        shifts: 0,
        scheduledDays: 0,
        mappingsAuto: 0,
        mappingsUnmatched: 0
      },
      {},
      {},
      message
    );

    throw error;
  }
}

export async function runConnecteamSyncJob(options: SyncConnectionOptions) {
  const supabase = createAdminSupabaseClient();
  const connections = await listEligibleConnections(supabase, options.connectionId);
  const results = [];

  for (const connection of connections.slice(0, options.connectionId ? 1 : 3)) {
    const result = await runConnectionSync(supabase, connection.id, options.trigger);
    if (result) {
      results.push({
        connectionId: connection.id,
        ...result
      });
    }
  }

  return results;
}

export async function runConnecteamPostConnectionSync(connectionId: string) {
  return runConnecteamSyncJob({
    connectionId,
    trigger: "manual"
  });
}

export async function saveZendeskConnecteamSchedule(options: {
  clientId: string;
  zendeskConnectionId: string;
  connecteamConnectionId: string;
  schedulerId: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  const { clientId, zendeskConnectionId, connecteamConnectionId, schedulerId } = options;

  if (!schedulerId) {
    const { error } = await supabase
      .from("zendesk_connecteam_schedules")
      .delete()
      .eq("zendesk_connection_id", zendeskConnectionId)
      .eq("connecteam_connection_id", connecteamConnectionId);

    if (error) {
      throw error;
    }

    return;
  }

  const { data: scheduler, error: schedulerError } = await supabase
    .from("connecteam_schedulers")
    .select("scheduler_id,scheduler_name,raw_payload")
    .eq("connecteam_connection_id", connecteamConnectionId)
    .eq("scheduler_id", schedulerId)
    .single();

  if (schedulerError) {
    throw schedulerError;
  }

  const { error } = await supabase.from("zendesk_connecteam_schedules").upsert(
    {
      client_id: clientId,
      zendesk_connection_id: zendeskConnectionId,
      connecteam_connection_id: connecteamConnectionId,
      scheduler_id: scheduler.scheduler_id,
      scheduler_name: scheduler.scheduler_name,
      raw_payload: scheduler.raw_payload
    },
    {
      onConflict: "zendesk_connection_id"
    }
  );

  if (error) {
    throw error;
  }
}

export async function saveAgentMappingOverride(options: {
  clientId: string;
  zendeskConnectionId: string;
  connecteamConnectionId: string;
  zendeskAgentId: string;
  connecteamUserId: string | null;
  inclusionStatus: AgentInclusionStatus;
}) {
  const supabase = createAdminSupabaseClient();
  const { clientId, zendeskConnectionId, connecteamConnectionId, zendeskAgentId, connecteamUserId, inclusionStatus } =
    options;

  const [{ data: zendeskAgent, error: zendeskError }, { data: connecteamUser, error: userError }] =
    await Promise.all([
      supabase
        .from("zendesk_agents")
        .select("name,email")
        .eq("client_id", clientId)
        .eq("zendesk_connection_id", zendeskConnectionId)
        .eq("zendesk_user_id", zendeskAgentId)
        .single(),
      connecteamUserId
        ? supabase
            .from("connecteam_users")
            .select("full_name,email")
            .eq("connecteam_connection_id", connecteamConnectionId)
            .eq("connecteam_user_id", connecteamUserId)
            .single()
        : Promise.resolve({ data: null, error: null })
    ]);

  if (zendeskError) {
    throw zendeskError;
  }

  if (userError) {
    throw userError;
  }

  if (connecteamUserId) {
    const { error: clearError } = await supabase
      .from("agent_mappings")
      .update({
        connecteam_user_id: null,
        connecteam_user_name: null,
        inclusion_status: "unmapped",
        match_source: "unmatched",
        matched_at: isoNow()
      })
      .eq("client_id", clientId)
      .eq("connecteam_connection_id", connecteamConnectionId)
      .eq("connecteam_user_id", connecteamUserId)
      .neq("zendesk_agent_id", zendeskAgentId);

    if (clearError) {
      throw clearError;
    }
  }

  const payload = {
    client_id: clientId,
    zendesk_connection_id: zendeskConnectionId,
    connecteam_connection_id: connecteamConnectionId,
    zendesk_agent_id: zendeskAgentId,
    connecteam_user_id: inclusionStatus === "mapped" ? connecteamUserId : null,
    display_name:
      (zendeskAgent?.name as string | null) ??
      (connecteamUser?.full_name as string | null) ??
      normalizeEmail(zendeskAgent?.email) ??
      "Mapped agent",
    email: normalizeEmail(zendeskAgent?.email ?? connecteamUser?.email),
    zendesk_agent_name: (zendeskAgent?.name as string | null) ?? null,
    connecteam_user_name: inclusionStatus === "mapped" ? ((connecteamUser?.full_name as string | null) ?? null) : null,
    inclusion_status: inclusionStatus,
    match_source: inclusionStatus === "mapped" ? "manual" : "unmatched",
    manual_override: inclusionStatus !== "unmapped",
    matched_at: isoNow()
  };

  const { error } = await supabase.from("agent_mappings").upsert(payload, {
    onConflict: "client_id,zendesk_connection_id,zendesk_agent_id"
  });

  if (error) {
    throw error;
  }
}
