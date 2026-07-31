import type { PayrollPeriod } from "@/lib/types";
import { formatPeriod } from "@/lib/payroll/period";

// Helvetica (the PDF base font) has no ₱ glyph, so PDFs print "PHP".
export function peso(n: number): string {
  return (
    "PHP " +
    (n ?? 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// Helvetica renders the en-dash as a blank; use a plain hyphen in PDFs.
export function dateRange(period: Pick<PayrollPeriod, "period_start" | "period_end">): string {
  return formatPeriod(period.period_start, period.period_end).replace(/–/g, "-");
}
