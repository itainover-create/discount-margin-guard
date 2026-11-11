/** Date helpers. Business dates are plain local YYYY-MM-DD strings, so no timezone drift. */
export type RangePreset = "this_week" | "this_month" | "last_month" | "last_90" | "this_year" | "all" | "custom";

export interface DateRange {
  from: string | null;
  to: string | null;
}

export const RANGE_PRESETS: RangePreset[] = ["this_week", "this_month", "last_month", "last_90", "this_year", "all", "custom"];

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const today = () => toDateString(new Date());

export function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

/** Start of week — Sunday, as in the Israeli work week. */
export function startOfWeek(value: string): string {
  const date = parseDate(value);
  return addDays(value, -date.getDay());
}

export function resolveRange(preset: RangePreset, now: string = today(), custom: DateRange = { from: null, to: null }): DateRange {
  const date = parseDate(now);
  const y = date.getFullYear();
  const m = date.getMonth();
  switch (preset) {
    case "this_week": {
      const from = startOfWeek(now);
      return { from, to: addDays(from, 6) };
    }
    case "this_month":
      return { from: toDateString(new Date(y, m, 1)), to: toDateString(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: toDateString(new Date(y, m - 1, 1)), to: toDateString(new Date(y, m, 0)) };
    case "last_90":
      return { from: addDays(now, -89), to: now };
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "custom": {
      const { from, to } = custom;
      return from && to && from > to ? { from: to, to: from } : { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

export function inRange(value: string | null | undefined, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  if (!value) return false;
  const day = value.slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

export const monthKey = (value: string) => value.slice(0, 7);
export const weekKey = (value: string) => startOfWeek(value.slice(0, 10));
