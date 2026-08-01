import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewExpenseReportDialog } from "@/components/expenses/new-expense-report-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPeriod } from "@/lib/payroll/period";
import { toCentavos, formatCentavos } from "@/lib/money";
import { resolvePayrollTotalCentavos } from "@/lib/expenses/totals";
import type { ExpenseItem, ExpensePeriod, PayrollEntry } from "@/lib/types";
import { CalendarDays, ChevronRight, Receipt } from "lucide-react";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const [{ data: periodRows }, { data: itemRows }, { data: entryRows }] = await Promise.all([
    supabase.from("expense_periods").select("*").order("period_start", { ascending: false }),
    supabase.from("expense_items").select("expense_period_id, amount"),
    supabase.from("payroll_entries").select("period_id, net_weekly_pay"),
  ]);

  const periods = (periodRows ?? []) as ExpensePeriod[];
  const items = (itemRows ?? []) as Pick<ExpenseItem, "expense_period_id" | "amount">[];
  const entries = (entryRows ?? []) as Pick<PayrollEntry, "period_id" | "net_weekly_pay">[];

  const expenseTotalByPeriod = new Map<string, number>();
  for (const item of items) {
    expenseTotalByPeriod.set(
      item.expense_period_id,
      (expenseTotalByPeriod.get(item.expense_period_id) ?? 0) + toCentavos(item.amount)
    );
  }
  const netTotalByPayrollPeriod: Record<string, number> = {};
  for (const e of entries) {
    netTotalByPayrollPeriod[e.period_id] =
      (netTotalByPayrollPeriod[e.period_id] ?? 0) + toCentavos(e.net_weekly_pay);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-rise">
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Weekly expense reports, newest first.</p>
        </div>
        <NewExpenseReportDialog />
      </div>

      {periods.length === 0 ? (
        <Card className="animate-rise">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Receipt className="h-7 w-7" />
            </span>
            <div>
              <p className="font-medium">No expense reports yet</p>
              <p className="text-sm text-muted-foreground">
                Start a weekly report to track expenses alongside payroll.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {periods.map((p) => {
            const grandTotal =
              resolvePayrollTotalCentavos(p, netTotalByPayrollPeriod) +
              (expenseTotalByPeriod.get(p.id) ?? 0);
            return (
              <Link key={p.id} href={`/expenses/${p.id}`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{formatPeriod(p.period_start, p.period_end)}</p>
                      <p className="text-sm text-muted-foreground">
                        Total {formatCentavos(grandTotal)}
                        {p.note ? ` · ${p.note}` : ""}
                      </p>
                    </div>
                    <Badge variant={p.status === "finalized" ? "default" : "secondary"}>
                      {p.status === "finalized" ? "Finalized" : "Draft"}
                    </Badge>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
