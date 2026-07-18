import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FinalizeButton } from "@/components/payroll/finalize-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatPeriod } from "@/lib/payroll/period";
import { formatPHP } from "@/lib/money";
import { fullName, type Employee, type PayrollEntry, type PayrollPeriod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, ChevronRight, Circle, Download } from "lucide-react";

export default async function PayrollPeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: periodRow } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!periodRow) notFound();
  const period = periodRow as PayrollPeriod;
  const finalized = period.status === "finalized";

  const [{ data: employeeRows }, { data: entryRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("*")
      .eq("is_active", true)
      .order("last_name", { ascending: true }),
    supabase.from("payroll_entries").select("*").eq("period_id", id),
  ]);

  const employees = (employeeRows ?? []) as Employee[];
  const entries = (entryRows ?? []) as PayrollEntry[];
  const entryByEmployee = new Map(entries.map((e) => [e.employee_id, e]));

  // For a finalized period, show the exact set of employees that were paid.
  const rosterIds = finalized ? entries.map((e) => e.employee_id) : employees.map((e) => e.id);
  const roster = finalized
    ? entries
        .map((e) => employees.find((emp) => emp.id === e.employee_id))
        .filter((e): e is Employee => Boolean(e))
    : employees;

  const computedCount = rosterIds.filter((eid) => entryByEmployee.has(eid)).length;
  const totalNet = entries.reduce((sum, e) => sum + e.net_weekly_pay, 0);
  const anyNonPositive = entries.some((e) => e.net_weekly_pay <= 0);
  const allComputed = employees.length > 0 && employees.every((e) => entryByEmployee.has(e.id));
  const canFinalize = !finalized && allComputed && !anyNonPositive && employees.length > 0;

  return (
    <div className="space-y-6">
      <div className="animate-rise flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/payroll"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All payroll runs
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {formatPeriod(period.period_start, period.period_end)}
            </h1>
            <Badge variant={finalized ? "default" : "secondary"}>
              {finalized ? "Finalized" : "Draft"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {computedCount} of {rosterIds.length} computed
            {period.note ? ` · ${period.note}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {finalized && (
            <a
              href={`/payroll/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              <Download className="h-4 w-4" /> Payslips PDF
            </a>
          )}
          {!finalized && <FinalizeButton periodId={id} canFinalize={canFinalize} anyNonPositive={anyNonPositive} allComputed={allComputed} />}
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">Total net pay ({entries.length} paid)</p>
            <p className="text-3xl font-bold tabular-nums text-primary">{formatPHP(totalNet)}</p>
          </div>
          {anyNonPositive && !finalized && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              One or more employees have net pay ≤ ₱0. Resolve before finalizing.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Roster */}
      {roster.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No active employees to pay. Add employees first.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {roster.map((emp) => {
            const entry = entryByEmployee.get(emp.id);
            const computed = Boolean(entry);
            const nonPositive = entry ? entry.net_weekly_pay <= 0 : false;
            return (
              <Link key={emp.id} href={`/payroll/${id}/${emp.id}`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    {computed ? (
                      <CheckCircle2
                        className={cn("h-6 w-6", nonPositive ? "text-destructive" : "text-success")}
                      />
                    ) : (
                      <Circle className="h-6 w-6 text-muted-foreground/40" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{fullName(emp)}</p>
                      <p className="text-xs text-muted-foreground">
                        {computed
                          ? `${entry!.days_worked} days worked`
                          : "Not computed yet"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "font-semibold tabular-nums",
                          nonPositive ? "text-destructive" : computed ? "text-success" : "text-muted-foreground"
                        )}
                      >
                        {computed ? formatPHP(entry!.net_weekly_pay) : "—"}
                      </p>
                    </div>
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
