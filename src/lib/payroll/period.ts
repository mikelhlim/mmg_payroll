import { addDays, format, startOfWeek } from "date-fns";

/**
 * Default weekly payroll period: Saturday → Friday of the current week.
 * date-fns weekStartsOn: 6 = Saturday.
 */
export function defaultPeriod(): { period_start: string; period_end: string } {
  const start = startOfWeek(new Date(), { weekStartsOn: 6 });
  const end = addDays(start, 6);
  return {
    period_start: format(start, "yyyy-MM-dd"),
    period_end: format(end, "yyyy-MM-dd"),
  };
}

/** Human-friendly period label, e.g. "Feb 1 – Feb 7, 2026". */
export function formatPeriod(start: string, end: string): string {
  try {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    const sameYear = s.getFullYear() === e.getFullYear();
    const left = format(s, sameYear ? "MMM d" : "MMM d, yyyy");
    const right = format(e, "MMM d, yyyy");
    return `${left} – ${right}`;
  } catch {
    return `${start} – ${end}`;
  }
}
