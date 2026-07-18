/**
 * Money utilities — all payroll arithmetic runs in integer *centavos* to
 * avoid binary floating-point drift (e.g. 0.1 + 0.2 !== 0.3). Pesos are only
 * used at the edges: parsing user input and formatting for display.
 *
 * DB columns are `numeric(12,2)` (peso.centavo). supabase-js returns them as
 * JS numbers; convert to centavos with `toCentavos` before computing.
 */

/** Peso amount (number or numeric string) → integer centavos, rounded to nearest. */
export function toCentavos(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return 0;
  // Round half away from zero so ₱0.005 → ₱0.01, ₱-0.005 → -₱0.01.
  return Math.sign(n) * Math.round(Math.abs(n) * 100);
}

/** Integer centavos → peso amount (number with 2 decimals of precision). */
export function fromCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

/**
 * Multiply a centavo amount by a (possibly fractional) count — e.g. daily
 * wage in centavos × 5.5 days — returning integer centavos rounded to nearest.
 */
export function multiplyCentavos(centavos: number, factor: number): number {
  if (!Number.isFinite(factor)) return 0;
  return Math.round(centavos * factor);
}

/** Sum a list of centavo amounts. */
export function sumCentavos(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}

/** Clamp a centavo amount to the inclusive range [min, max]. */
export function clampCentavos(centavos: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(centavos)));
}

const PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a peso amount for display, e.g. 1234.5 → "₱1,234.50". */
export function formatPHP(amount: number | string | null | undefined): string {
  const centavos = toCentavos(amount);
  return PHP.format(fromCentavos(centavos));
}

/** Format an integer-centavo amount for display, e.g. 123450 → "₱1,234.50". */
export function formatCentavos(centavos: number): string {
  return PHP.format(fromCentavos(centavos));
}
