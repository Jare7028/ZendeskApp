type Tone = "success" | "warning" | "danger" | "neutral";

type SyncRunSnapshot = {
  trigger_source: string;
  sync_mode: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type SyncTrustOptions = {
  system: "zendesk" | "connecteam";
  syncStatus: string;
  lastSyncStartedAt: string | null;
  latestRun: SyncRunSnapshot | null;
  latestSuccessAt: string | null;
  latestFailureAt: string | null;
  latestFailureMessage: string | null;
  freshnessAt: string | null;
  freshnessSourceLabel: string;
};

export type SyncTone = Tone;

export type SyncSignal = {
  label: string;
  tone: Tone;
};

export type DerivedSyncTrust = {
  health: SyncSignal;
  current: SyncSignal;
  freshness: SyncSignal & {
    at: string | null;
    sourceLabel: string;
  };
  summary: string;
  latestSuccessAt: string | null;
  latestFailureAt: string | null;
  latestFailureMessage: string | null;
  hasUsableData: boolean;
  failureNeedsAttention: boolean;
};

const CURRENT_DATA_MAX_AGE_HOURS = 6;
const USABLE_DATA_MAX_AGE_HOURS = 24;

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function pickLatestTimestamp(values: Array<string | null>) {
  return values.reduce<string | null>((latest, candidate) => {
    if (!candidate) {
      return latest;
    }

    if (!latest) {
      return candidate;
    }

    return parseTimestamp(candidate)! > parseTimestamp(latest)! ? candidate : latest;
  }, null);
}

export function pickEarliestTimestamp(values: Array<string | null>) {
  return values.reduce<string | null>((earliest, candidate) => {
    if (!candidate) {
      return earliest;
    }

    if (!earliest) {
      return candidate;
    }

    return parseTimestamp(candidate)! < parseTimestamp(earliest)! ? candidate : earliest;
  }, null);
}

function getFreshnessLabel(timestamp: string | null) {
  const parsed = parseTimestamp(timestamp);
  if (parsed === null) {
    return { label: "no data", tone: "danger" } satisfies SyncSignal;
  }

  const ageHours = (Date.now() - parsed) / (1000 * 60 * 60);

  if (ageHours <= CURRENT_DATA_MAX_AGE_HOURS) {
    return { label: "current", tone: "success" } satisfies SyncSignal;
  }

  if (ageHours <= USABLE_DATA_MAX_AGE_HOURS) {
    return { label: "aging", tone: "warning" } satisfies SyncSignal;
  }

  return { label: "stale", tone: "danger" } satisfies SyncSignal;
}

export function getStatusToneClassName(tone: Tone) {
  if (tone === "success") {
    return "bg-emerald-100 text-emerald-900";
  }

  if (tone === "warning") {
    return "bg-amber-100 text-amber-900";
  }

  if (tone === "neutral") {
    return "bg-slate-200 text-slate-900";
  }

  return "bg-rose-100 text-rose-900";
}

export function getAlertToneClassName(tone: Exclude<Tone, "neutral"> | "neutral") {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (tone === "neutral") {
    return "border-border bg-muted/40 text-foreground";
  }

  return "border-rose-200 bg-rose-50 text-rose-900";
}

export function getLatestSyncEventTimestamps(
  latestRun: SyncRunSnapshot | null,
  fallbackSuccessAt: string | null,
  fallbackFailureAt: string | null
) {
  const latestSuccessAt =
    latestRun?.status === "succeeded" || latestRun?.status === "partial"
      ? pickLatestTimestamp([latestRun.completed_at, fallbackSuccessAt])
      : fallbackSuccessAt;
  const latestFailureAt = latestRun?.status === "failed"
    ? pickLatestTimestamp([latestRun.completed_at, fallbackFailureAt])
    : fallbackFailureAt;

  return { latestSuccessAt, latestFailureAt };
}

export function deriveSyncTrust(options: SyncTrustOptions): DerivedSyncTrust {
  const freshness = getFreshnessLabel(options.freshnessAt);
  const hasUsableData = options.latestSuccessAt !== null || options.freshnessAt !== null;
  const latestSuccessMs = parseTimestamp(options.latestSuccessAt);
  const latestFailureMs = parseTimestamp(options.latestFailureAt);
  const failureNeedsAttention =
    latestFailureMs !== null && (latestSuccessMs === null || latestFailureMs > latestSuccessMs);

  let current: SyncSignal;
  if (options.syncStatus === "running") {
    current = { label: "syncing", tone: "warning" };
  } else if (failureNeedsAttention && !hasUsableData) {
    current = { label: "failed", tone: "danger" };
  } else {
    current = { label: "idle", tone: "neutral" };
  }

  let health: SyncSignal;
  let summary: string;

  if (!hasUsableData) {
    health = failureNeedsAttention ? { label: "failed", tone: "danger" } : { label: "empty", tone: "neutral" };
    summary = failureNeedsAttention
      ? `No usable ${options.system} data is available.`
      : `No successful ${options.system} sync has landed yet.`;
  } else if (failureNeedsAttention) {
    if (freshness.label === "current") {
      health = { label: "healthy", tone: "success" };
      summary = "Latest sync failed, but the last good data is still current.";
    } else if (freshness.label === "aging") {
      health = { label: "degraded", tone: "warning" };
      summary = "Latest sync failed. The last good data is still usable, but aging.";
    } else {
      health = { label: "stale", tone: "danger" };
      summary = "Latest sync failed and the last good data is now stale.";
    }
  } else if (freshness.label === "current") {
    health = { label: "healthy", tone: "success" };
    summary = "Current data is available and the connection looks healthy.";
  } else if (freshness.label === "aging") {
    health = { label: "aging", tone: "warning" };
    summary = "No current failure is visible, but the data is aging.";
  } else {
    health = { label: "stale", tone: "danger" };
    summary = "No current failure is visible, but the data is stale.";
  }

  return {
    health,
    current,
    freshness: {
      ...freshness,
      at: options.freshnessAt,
      sourceLabel: options.freshnessSourceLabel
    },
    summary,
    latestSuccessAt: options.latestSuccessAt,
    latestFailureAt: options.latestFailureAt,
    latestFailureMessage: options.latestFailureMessage,
    hasUsableData,
    failureNeedsAttention
  };
}
