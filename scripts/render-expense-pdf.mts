// Dev-only: render an expense report's PDF to a file for inspection.
//   npx tsx --env-file=.env.local scripts/render-expense-pdf.mts <expensePeriodId> <outPath>
import { renderToFile } from "@react-pdf/renderer";
import { createElement } from "react";
import { createClient } from "@supabase/supabase-js";
import { ExpenseReportDocument } from "../src/lib/pdf/expense-report-document";

const expensePeriodId = process.argv[2];
const outPath = process.argv[3] ?? "/tmp/expense-report.pdf";

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const { data: period } = await c
  .from("expense_periods")
  .select("*")
  .eq("id", expensePeriodId)
  .maybeSingle();
if (!period) {
  console.error(`Expense report ${expensePeriodId} not found`);
  process.exit(1);
}

const { data: items } = await c
  .from("expense_items")
  .select("*")
  .eq("expense_period_id", expensePeriodId)
  .order("sort_order", { ascending: true });
const { data: allCategories } = await c
  .from("expense_categories")
  .select("*")
  .order("sort_order", { ascending: true });
const { data: entries } = await c
  .from("payroll_entries")
  .select("net_weekly_pay")
  .eq("period_id", period.payroll_period_id);

type RawExpenseItem = {
  category_id: string;
  item_date: string | null;
  description: string | null;
  amount: number;
};

const usedCategoryIds = new Set((items ?? []).map((i) => i.category_id));
const categories = (allCategories ?? []).filter((c) => c.is_active || usedCategoryIds.has(c.id));

const itemsByCategory = new Map<string, RawExpenseItem[]>();
for (const item of (items ?? []) as RawExpenseItem[]) {
  const bucket = itemsByCategory.get(item.category_id);
  if (bucket) bucket.push(item);
  else itemsByCategory.set(item.category_id, [item]);
}

const pdfCategories = categories.map((c) => ({
  id: c.id,
  name: c.name,
  items: (itemsByCategory.get(c.id) ?? []).map((i) => ({
    item_date: i.item_date,
    description: i.description,
    amount: i.amount,
  })),
}));

const payrollNetTotalCentavos = (entries ?? []).reduce(
  (sum, e) => sum + Math.round((e.net_weekly_pay ?? 0) * 100),
  0
);

await renderToFile(
  createElement(ExpenseReportDocument, {
    period,
    finalized: period.status === "finalized",
    categories: pdfCategories,
    payrollNetTotalCentavos,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any,
  outPath
);
console.log(`wrote ${outPath} (${pdfCategories.length} expense types)`);
