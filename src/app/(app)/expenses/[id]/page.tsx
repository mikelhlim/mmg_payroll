import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExpenseReportForm, type FinalizedPayrollOption } from "@/components/expenses/expense-report-form";
import { FinalizeExpenseButton } from "@/components/expenses/finalize-expense-button";
import { AmendExpenseButton } from "@/components/expenses/amend-expense-button";
import { DeleteExpenseButton } from "@/components/expenses/delete-expense-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatPeriod } from "@/lib/payroll/period";
import { toCentavos } from "@/lib/money";
import type { ExpenseCategory, ExpenseItem, ExpensePeriod, PayrollEntry, PayrollPeriod } from "@/lib/types";
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

  const [{ data: itemRows }, { data: categoryRows }, { data: finalizedPayrollRows }, { data: entryRows }] =
    await Promise.all([
      supabase
        .from("expense_items")
        .select("*")
        .eq("expense_period_id", id)
        .order("sort_order", { ascending: true }),
      supabase.from("expense_categories").select("*").order("sort_order", { ascending: true }),
      // Every finalized payroll run is offered as a link target — not just
      // one matching this report's dates — since a report can now be created
      // for a period before, or independently of, any particular run.
      supabase
        .from("payroll_periods")
        .select("id, period_start, period_end")
        .eq("status", "finalized")
        .order("period_start", { ascending: false }),
      supabase.from("payroll_entries").select("period_id, net_weekly_pay"),
    ]);

  const items = (itemRows ?? []) as ExpenseItem[];
  const allCategories = (categoryRows ?? []) as ExpenseCategory[];
  const usedCategoryIds = new Set(items.map((i) => i.category_id));
  // Active categories (for entry) plus any archived category that still has
  // items on THIS report, so past reports keep rendering their history.
  const categories = allCategories.filter((c) => c.is_active || usedCategoryIds.has(c.id));

  const finalizedRuns = (finalizedPayrollRows ?? []) as Pick<
    PayrollPeriod,
    "id" | "period_start" | "period_end"
  >[];
  const netEntries = (entryRows ?? []) as Pick<PayrollEntry, "period_id" | "net_weekly_pay">[];
  const netTotalByPayrollPeriod: Record<string, number> = {};
  for (const e of netEntries) {
    netTotalByPayrollPeriod[e.period_id] = (netTotalByPayrollPeriod[e.period_id] ?? 0) + toCentavos(e.net_weekly_pay);
  }
  const finalizedPayrollPeriods: FinalizedPayrollOption[] = finalizedRuns.map((r) => ({
    id: r.id,
    period_start: r.period_start,
    period_end: r.period_end,
    netTotalCentavos: netTotalByPayrollPeriod[r.id] ?? 0,
  }));

  // The linked run's total must stay live even if it's since been reopened
  // to draft (no longer in the finalized list above) — a finalized expense
  // report doesn't freeze once linked. Only hit the DB again for this rare
  // case; the common case is already covered by finalizedPayrollPeriods.
  let linkedPayrollPeriod: FinalizedPayrollOption | null = null;
  if (period.payroll_period_id) {
    linkedPayrollPeriod = finalizedPayrollPeriods.find((r) => r.id === period.payroll_period_id) ?? null;
    if (!linkedPayrollPeriod) {
      const { data: runRow } = await supabase
        .from("payroll_periods")
        .select("id, period_start, period_end")
        .eq("id", period.payroll_period_id)
        .maybeSingle();
      if (runRow) {
        linkedPayrollPeriod = {
          id: runRow.id,
          period_start: runRow.period_start,
          period_end: runRow.period_end,
          netTotalCentavos: netTotalByPayrollPeriod[runRow.id] ?? 0,
        };
      }
    }
  }

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
            {!finalized && !period.payroll_period_id && period.payroll_total_override === null && (
              <span className="text-warning-foreground"> · payroll total not set yet</span>
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
        payrollTotalOverride={period.payroll_total_override}
        finalizedPayrollPeriods={finalizedPayrollPeriods}
        linkedPayrollPeriod={linkedPayrollPeriod}
      />
    </div>
  );
}
