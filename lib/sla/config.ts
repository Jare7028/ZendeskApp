import "server-only";

export type SlaConfig = {
  firstReplyTargetMinutes: number;
  fullResolutionTargetMinutes: number;
  alertThresholdPercent: number;
  alertsEnabled: boolean;
  cooldownMinutes: number;
};

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  firstReplyTargetMinutes: 60,
  fullResolutionTargetMinutes: 480,
  alertThresholdPercent: 90,
  alertsEnabled: true,
  cooldownMinutes: 360
};

type JsonRecord = Record<string, unknown>;

function toPositiveInteger(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

function toPercentage(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(100, Math.max(0, Number(parsed.toFixed(1))));
}

export function readSlaConfig(metadata: JsonRecord | null | undefined): SlaConfig | null {
  const sla = metadata?.sla;

  if (!sla || typeof sla !== "object") {
    return null;
  }

  const slaRecord = sla as JsonRecord;
  const firstReplyTargetMinutes = toPositiveInteger(slaRecord.firstReplyTargetMinutes);
  const fullResolutionTargetMinutes = toPositiveInteger(slaRecord.fullResolutionTargetMinutes);
  const alertThresholdPercent = toPercentage(
    slaRecord.alertThresholdPercent ?? slaRecord.alertThresholdPercentage
  );
  const cooldownMinutes = toPositiveInteger(slaRecord.cooldownMinutes) ?? DEFAULT_SLA_CONFIG.cooldownMinutes;
  const alertsEnabled =
    typeof slaRecord.alertsEnabled === "boolean"
      ? slaRecord.alertsEnabled
      : typeof slaRecord.alertEnabled === "boolean"
        ? slaRecord.alertEnabled
        : DEFAULT_SLA_CONFIG.alertsEnabled;

  if (
    firstReplyTargetMinutes === null ||
    fullResolutionTargetMinutes === null ||
    alertThresholdPercent === null
  ) {
    return null;
  }

  return {
    firstReplyTargetMinutes,
    fullResolutionTargetMinutes,
    alertThresholdPercent,
    alertsEnabled,
    cooldownMinutes
  };
}

export const parseSlaConfig = readSlaConfig;

export function mergeSlaMetadata(metadata: JsonRecord | null | undefined, config: SlaConfig) {
  const nextMetadata = { ...(metadata ?? {}) } as JsonRecord;

  nextMetadata.sla = {
    firstReplyTargetMinutes: config.firstReplyTargetMinutes,
    fullResolutionTargetMinutes: config.fullResolutionTargetMinutes,
    alertThresholdPercent: config.alertThresholdPercent,
    alertsEnabled: config.alertsEnabled,
    cooldownMinutes: config.cooldownMinutes,
    updatedAt: new Date().toISOString()
  };

  return nextMetadata;
}

export const mergeSlaConfigMetadata = mergeSlaMetadata;

export function normalizeSlaConfigInput(input: {
  firstReplyTargetMinutes: unknown;
  fullResolutionTargetMinutes: unknown;
  alertThresholdPercent: unknown;
  alertsEnabled: unknown;
  cooldownMinutes: unknown;
}): SlaConfig | null {
  const firstReplyTargetMinutes = toPositiveInteger(input.firstReplyTargetMinutes);
  const fullResolutionTargetMinutes = toPositiveInteger(input.fullResolutionTargetMinutes);
  const alertThresholdPercent = toPercentage(input.alertThresholdPercent);
  const cooldownMinutes = toPositiveInteger(input.cooldownMinutes) ?? DEFAULT_SLA_CONFIG.cooldownMinutes;

  if (
    firstReplyTargetMinutes === null ||
    fullResolutionTargetMinutes === null ||
    alertThresholdPercent === null
  ) {
    return null;
  }

  return {
    firstReplyTargetMinutes,
    fullResolutionTargetMinutes,
    alertThresholdPercent,
    alertsEnabled:
      typeof input.alertsEnabled === "boolean"
        ? input.alertsEnabled
        : input.alertsEnabled === "on" || input.alertsEnabled === "true",
    cooldownMinutes
  };
}
