import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExpenseReportForm } from "@/components/expenses/expense-report-form";
import { FinalizeExpenseButton } from "@/components/expenses/finalize-expense-button";
import { AmendExpenseButton } from "@/components/expenses/amend-expense-button";
import { DeleteExpenseButton } from "@/components/expenses/delete-expense-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatPeriod } from "@/lib/payroll/period";
import { toCentavos } from "@/lib/money";
import type {
  ExpenseCategory,
  ExpenseItem,
  ExpensePeriod,
  PayrollEntry,
  PayrollPeriod,
} from "@/lib/types";
import { ArrowLeft, Download } from "lucide-react";

export default async function ExpenseReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: periodRow } = await supabase
    .from("expense_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!periodRow) notFound();
  const period = periodRow as ExpensePeriod;
  const finalized = period.status === "finalized";

  const [{ data: itemRows }, { data: categoryRows }, { data: payrollPeriodRow }, { data: entryRows }] =
    await Promise.all([
      supabase
        .from("expense_items")
        .select("*")
        .eq("expense_period_id", id)
        .order("sort_order", { ascending: true }),
      supabase.from("expense_categories").select("*").order("sort_order", { ascending: true }),
      supabase.from("payroll_periods").select("*").eq("id", period.payroll_period_id).maybeSingle(),
      supabase
        .from("payroll_entries")
        .select("net_weekly_pay")
        .eq("period_id", period.payroll_period_id),
    ]);

  const items = (itemRows ?? []) as ExpenseItem[];
  const allCategories = (categoryRows ?? []) as ExpenseCategory[];
  const usedCategoryIds = new Set(items.map((i) => i.category_id));
  // Active categories (for entry) plus any archived category that still has
  // items on THIS report, so past reports keep rendering their history.
  const categories = allCategories.filter((c) => c.is_active || usedCategoryIds.has(c.id));

  const payrollPeriod = payrollPeriodRow as PayrollPeriod | null;
  const netEntries = (entryRows ?? []) as Pick<PayrollEntry, "net_weekly_pay">[];
  const payrollNetTotalCentavos = netEntries.reduce((sum, e) => sum + toCentavos(e.net_weekly_pay), 0);

  const itemsByCategory: Record<string, ExpenseItem[]> = {};
  for (const item of items) {
    const bucket = itemsByCategory[item.category_id];
    if (bucket) bucket.push(item);
    else itemsByCategory[item.category_id] = [item];
  }

  return (
    <div className="space-y-6">
      <div className="animate-rise flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/expenses"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All expense reports
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {formatPeriod(period.period_start, period.period_end)}
            </h1>
            <Badge variant={finalized ? "default" : "secondary"}>
              {finalized ? "Finalized" : "Draft"}
            </Badge>
            {(period.version ?? 1) > 1 && (
              <Badge variant="secondary" className="bg-warning/15 text-warning-foreground">
                v{period.version}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {period.note ? period.note : "Expense report"}
            {payrollPeriod && payrollPeriod.status !== "finalized" && (
              <span className="text-warning-foreground"> · linked payroll run is still a draft</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/expenses/${id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            <Download className="h-4 w-4" /> Download PDF
          </a>
          {finalized ? (
            <AmendExpenseButton expensePeriodId={id} />
          ) : (
            <>
              <FinalizeExpenseButton expensePeriodId={id} />
              <DeleteExpenseButton expensePeriodId={id} />
            </>
          )}
        </div>
      </div>

      <ExpenseReportForm
        expensePeriodId={id}
        finalized={finalized}
        categories={categories}
        itemsByCategory={itemsByCategory}
        payrollPeriodId={period.payroll_period_id}
        payrollNetTotalCentavos={payrollNetTotalCentavos}
      />
    </div>
  );
}
