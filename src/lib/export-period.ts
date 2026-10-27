export function isExportPeriodWithinLimit(start: string, end: string, maxDays = 31) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return false;
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || new Date(first).toISOString().slice(0, 10) !== start || new Date(last).toISOString().slice(0, 10) !== end) return false;
  const days = (last - first) / 86400000 + 1;
  return Number.isInteger(days) && days > 0 && days <= maxDays;
}
