import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ExpenseReportDocument, type ExpensePdfCategory } from "@/lib/pdf/expense-report-document";
import { toCentavos } from "@/lib/money";
import { resolvePayrollTotalCentavos } from "@/lib/expenses/totals";
import type { ExpenseCategory, ExpenseItem, ExpensePeriod, PayrollEntry } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: periodRow } = await supabase
    .from("expense_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!periodRow) return new Response("Expense report not found", { status: 404 });
  const period = periodRow as ExpensePeriod;

  const [{ data: itemRows }, { data: categoryRows }, { data: entryRows }] = await Promise.all([
    supabase
      .from("expense_items")
      .select("*")
      .eq("expense_period_id", id)
      .order("sort_order", { ascending: true }),
    supabase.from("expense_categories").select("*").order("sort_order", { ascending: true }),
    // Unfiltered — resolvePayrollTotalCentavos looks up whichever run (if
    // any) is linked, and this must stay live even if that run has since
    // been reopened to draft.
    supabase.from("payroll_entries").select("period_id, net_weekly_pay"),
  ]);

  const items = (itemRows ?? []) as ExpenseItem[];
  const allCategories = (categoryRows ?? []) as ExpenseCategory[];
  const usedCategoryIds = new Set(items.map((i) => i.category_id));
  // Active categories plus any archived one that still has items on THIS
  // report — same rule as the editor page, so the PDF matches what's shown.
  const categories = allCategories.filter((c) => c.is_active || usedCategoryIds.has(c.id));

  const itemsByCategory = new Map<string, ExpenseItem[]>();
  for (const item of items) {
    const bucket = itemsByCategory.get(item.category_id);
    if (bucket) bucket.push(item);
    else itemsByCategory.set(item.category_id, [item]);
  }

  const pdfCategories: ExpensePdfCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    perItemPdfPages: c.per_item_pdf_pages,
    items: (itemsByCategory.get(c.id) ?? []).map((i) => ({
      item_date: i.item_date,
      description: i.description,
      amount: i.amount,
    })),
  }));

  const netEntries = (entryRows ?? []) as Pick<PayrollEntry, "period_id" | "net_weekly_pay">[];
  const netTotalByPayrollPeriod: Record<string, number> = {};
  for (const e of netEntries) {
    netTotalByPayrollPeriod[e.period_id] = (netTotalByPayrollPeriod[e.period_id] ?? 0) + toCentavos(e.net_weekly_pay);
  }
  const payrollNetTotalCentavos = resolvePayrollTotalCentavos(period, netTotalByPayrollPeriod);

  // ExpenseReportDocument returns a <Document>; cast past renderToBuffer's
  // strict ReactElement<DocumentProps> param (it renders the component fine
  // at runtime) — same pattern as the payslip PDF route.
  const element = createElement(ExpenseReportDocument, {
    period,
    finalized: period.status === "finalized",
    categories: pdfCategories,
    payrollNetTotalCentavos,
  }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(element);

  const filename = `expenses-${period.period_start}_to_${period.period_end}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
