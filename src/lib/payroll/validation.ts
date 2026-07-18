// Pure payroll-period validation helpers (unit-tested in validation.test.ts).

export type DateRange = { period_start: string; period_end: string };

const MS_PER_DAY = 86_400_000;

function toDate(d: string): Date {
  return new Date(d + "T00:00:00");
}

/** Inclusive number of calendar days in a period, e.g. Sat→Fri = 7. */
export function periodDays(range: DateRange): number {
  const start = toDate(range.period_start);
  const end = toDate(range.period_end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

/**
 * True when the attendance an employee entered accounts for exactly the whole
 * period: days_worked + days_on_leave === periodDays. Only matched entries may
 * be finalized (unmatched can still be saved as draft).
 */
export function daysMatch(
  range: DateRange,
  daysWorked: number,
  daysOnLeave: number
): boolean {
  return (Number(daysWorked) || 0) + (Number(daysOnLeave) || 0) === periodDays(range);
}

export type OverlapAnalysis = {
  /** An existing period whose dates intersect the new one, if any. */
  overlap: DateRange | null;
  /** The most recent period ending before the new start, if any. */
  precededBy: DateRange | null;
  /** Number of skipped days between the previous period and the new start (0 = contiguous). */
  gapDays: number;
};

/**
 * Compare a proposed new period against all existing periods to detect an
 * overlap or a gap (skipped days) after the latest prior period.
 */
export function analyzeNewPeriod(existing: DateRange[], next: DateRange): OverlapAnalysis {
  const nStart = toDate(next.period_start).getTime();
  const nEnd = toDate(next.period_end).getTime();

  let overlap: DateRange | null = null;
  let precededBy: DateRange | null = null;
  let precededByEnd = -Infinity;

  for (const p of existing) {
    const pStart = toDate(p.period_start).getTime();
    const pEnd = toDate(p.period_end).getTime();
    // Ranges intersect when each starts on/before the other ends.
    if (nStart <= pEnd && nEnd >= pStart) {
      overlap = overlap ?? p;
    }
    if (pEnd < nStart && pEnd > precededByEnd) {
      precededByEnd = pEnd;
      precededBy = p;
    }
  }

  let gapDays = 0;
  if (precededBy && !overlap) {
    // Contiguous means new start == previous end + 1 day.
    gapDays = Math.round((nStart - precededByEnd) / MS_PER_DAY) - 1;
    if (gapDays < 0) gapDays = 0;
  }

  return { overlap, precededBy, gapDays };
}
