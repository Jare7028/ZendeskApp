export function formatNumber(value: number | null, maximumFractionDigits = 1) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits
  }).format(value);
}

export function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  return `${(value * 100).toFixed(1)}%`;
}

export function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data";
  }

  if (value >= 60) {
    return `${(value / 60).toFixed(1)}h`;
  }

  return `${value.toFixed(1)}m`;
}
