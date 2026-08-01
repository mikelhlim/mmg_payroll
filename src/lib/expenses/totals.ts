import { sumCentavos, toCentavos } from "@/lib/money";

/**
 * Every expense-type card always shows at least this many rows, even when
 * fewer are populated — new rows are appended past this once the user adds
 * more. Blank rows below this line are never persisted (see isBlankItem).
 */
export const MIN_ROWS = 10;

export type ExpenseLineInput = {
  item_date: string | null;
  description: string | null;
  amount: number;
};

const blankLine = (): ExpenseLineInput => ({ item_date: null, description: "", amount: 0 });

/** A row with no description, no date, and a zero amount is never persisted. */
export function isBlankItem(item: ExpenseLineInput): boolean {
  const hasDescription = Boolean(item.description?.trim());
  const hasDate = Boolean(item.item_date);
  const hasAmount = toCentavos(item.amount) !== 0;
  return !hasDescription && !hasDate && !hasAmount;
}

/** Sum a category's line items in integer centavos (avoids float drift). */
export function categorySubtotal(items: ExpenseLineInput[]): number {
  return sumCentavos(items.map((i) => toCentavos(i.amount)));
}

/** Pad a category's rows out to MIN_ROWS visible rows. Never truncates. */
export function padToMinRows(items: ExpenseLineInput[], minRows = MIN_ROWS): ExpenseLineInput[] {
  if (items.length >= minRows) return items;
  return [...items, ...Array.from({ length: minRows - items.length }, blankLine)];
}

/**
 * Seed a category's rows for a brand-new expense report: the previous
 * report's non-blank descriptions, in order — dates and amounts always start
 * blank, per the "descriptions only" carry-forward decision. When there's no
 * previous report to draw from (the category's first report, or a newly
 * added category), falls back to the category's own seeded defaults.
 * Always padded out to MIN_ROWS visible rows.
 */
export function carryForwardDescriptions(
  previousItems: ExpenseLineInput[],
  category: { default_descriptions: string[] }
): ExpenseLineInput[] {
  const carried = previousItems
    .map((i) => i.description?.trim() ?? "")
    .filter((d) => d.length > 0);

  const descriptions = carried.length > 0 ? carried : category.default_descriptions;

  const rows: ExpenseLineInput[] = descriptions.map((description) => ({
    item_date: null,
    description,
    amount: 0,
  }));

  return padToMinRows(rows);
}

/**
 * Resolve which source drives a report's payroll total: a linked finalized
 * run's live net-pay sum (recomputed from current payroll_entries, never a
 * snapshot) when payroll_period_id is set, otherwise the manual
 * payroll_total_override, otherwise zero (nothing attached yet).
 */
export function resolvePayrollTotalCentavos(
  period: { payroll_period_id: string | null; payroll_total_override: number | null },
  netTotalByPayrollPeriodCentavos: Record<string, number>
): number {
  if (period.payroll_period_id) {
    return netTotalByPayrollPeriodCentavos[period.payroll_period_id] ?? 0;
  }
  if (period.payroll_total_override !== null) {
    return toCentavos(period.payroll_total_override);
  }
  return 0;
}

export type ExpenseTotals = {
  payrollTotalCentavos: number;
  byCategoryCentavos: Record<string, number>;
  expensesTotalCentavos: number;
  grandTotalCentavos: number;
};

/**
 * The Total Expenses rollup: the linked payroll run's net-pay total plus a
 * subtotal per expense type, and a grand total of all of it. Pure — the same
 * function backs both the live client-side preview and (via the payslip-
 * document analogue) the PDF.
 */
export function expenseTotals(input: {
  payrollNetTotalCentavos: number;
  categories: { id: string }[];
  itemsByCategory: Record<string, ExpenseLineInput[]>;
}): ExpenseTotals {
  const byCategoryCentavos: Record<string, number> = {};
  for (const c of input.categories) {
    byCategoryCentavos[c.id] = categorySubtotal(input.itemsByCategory[c.id] ?? []);
  }
  const expensesTotalCentavos = sumCentavos(Object.values(byCategoryCentavos));
  const grandTotalCentavos = sumCentavos([input.payrollNetTotalCentavos, expensesTotalCentavos]);
  return {
    payrollTotalCentavos: input.payrollNetTotalCentavos,
    byCategoryCentavos,
    expensesTotalCentavos,
    grandTotalCentavos,
  };
}
