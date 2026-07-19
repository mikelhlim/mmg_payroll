import { createClient } from "@/lib/supabase/server";
import { PeriodReportList, type PeriodSummary } from "@/components/reports/period-list";
import type { PayrollEntry, PayrollPeriod } from "@/lib/types";

export default async function ReportsPage() {
  const supabase = await createClient();
  const [{ data: periodRows }, { data: entryRows }] = await Promise.all([
    supabase.from("payroll_periods").select("*").order("period_start", { ascending: false }),
    supabase.from("payroll_entries").select("period_id, net_weekly_pay"),
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

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Select a payroll period to see who was paid and how much.
        </p>
      </div>
      <PeriodReportList periods={summaries} />
    </div>
  );
}
