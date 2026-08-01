import { createClient } from "@/lib/supabase/server";
import { PeriodReportList, type PeriodSummary } from "@/components/reports/period-list";
import { ExpenseReportList, type ExpenseReportSummary } from "@/components/reports/expense-report-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toCentavos } from "@/lib/money";
import { resolvePayrollTotalCentavos } from "@/lib/expenses/totals";
import type { ExpenseItem, ExpensePeriod, PayrollEntry, PayrollPeriod } from "@/lib/types";

export default async function ReportsPage() {
  const supabase = await createClient();
  const [
    { data: periodRows },
    { data: entryRows },
    { data: expensePeriodRows },
    { data: expenseItemRows },
  ] = await Promise.all([
    supabase.from("payroll_periods").select("*").order("period_start", { ascending: false }),
    supabase.from("payroll_entries").select("period_id, net_weekly_pay"),
    supabase.from("expense_periods").select("*").order("period_start", { ascending: false }),
    supabase.from("expense_items").select("expense_period_id, amount"),
  ]);

  const periods = (periodRows ?? []) as PayrollPeriod[];
  const entries = (entryRows ?? []) as Pick<PayrollEntry, "period_id" | "net_weekly_pay">[];

  const summaries: PeriodSummary[] = periods.map((p) => {
    const inPeriod = entries.filter((e) => e.period_id === p.id);
    return {
      id: p.id,
      period_start: p.period_start,
      period_end: p.period_end,
      status: p.status,
      note: p.note,
      employeeCount: inPeriod.length,
      totalNet: inPeriod.reduce((sum, e) => sum + e.net_weekly_pay, 0),
    };
  });

  const expensePeriods = (expensePeriodRows ?? []) as ExpensePeriod[];
  const expenseItems = (expenseItemRows ?? []) as Pick<ExpenseItem, "expense_period_id" | "amount">[];
  const netTotalByPayrollPeriod: Record<string, number> = {};
  for (const e of entries) {
    netTotalByPayrollPeriod[e.period_id] =
      (netTotalByPayrollPeriod[e.period_id] ?? 0) + toCentavos(e.net_weekly_pay);
  }
  const expenseTotalByPeriod = new Map<string, number>();
  for (const item of expenseItems) {
    expenseTotalByPeriod.set(
      item.expense_period_id,
      (expenseTotalByPeriod.get(item.expense_period_id) ?? 0) + toCentavos(item.amount)
    );
  }
  const expenseSummaries: ExpenseReportSummary[] = expensePeriods.map((p) => ({
    id: p.id,
    period_start: p.period_start,
    period_end: p.period_end,
    status: p.status,
    note: p.note,
    grandTotalCentavos:
      resolvePayrollTotalCentavos(p, netTotalByPayrollPeriod) + (expenseTotalByPeriod.get(p.id) ?? 0),
  }));

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Select a payroll period or expense report to see the details.
        </p>
      </div>
      <Tabs defaultValue="payroll">
        <TabsList>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="payroll">
          <PeriodReportList periods={summaries} />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpenseReportList reports={expenseSummaries} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
