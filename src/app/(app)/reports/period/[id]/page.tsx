import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fullName, type Employee, type PayrollEntry, type PayrollPeriod } from "@/lib/types";
import { formatPeriod } from "@/lib/payroll/period";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ArrowLeft, ChevronRight, Users } from "lucide-react";

export default async function ReportsPeriodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: periodRow } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!periodRow) notFound();
  const period = periodRow as PayrollPeriod;

  const { data: entryRows } = await supabase
    .from("payroll_entries")
    .select("*, employees(*)")
    .eq("period_id", id);

  const rows = (entryRows ?? [])
    .filter((e) => e.employees)
    .map((e) => {
      const { employees, ...entry } = e as PayrollEntry & { employees: Employee };
      return { entry: entry as PayrollEntry, employee: employees as Employee };
    })
    .sort((a, b) => fullName(a.employee).localeCompare(fullName(b.employee)));

  const totalNet = rows.reduce((sum, r) => sum + r.entry.net_weekly_pay, 0);

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <Link
          href="/reports"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All payroll periods
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {formatPeriod(period.period_start, period.period_end)}
          </h1>
          <Badge variant={period.status === "finalized" ? "default" : "secondary"}>
            {period.status === "finalized" ? "Finalized" : "Draft"}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {rows.length} {rows.length === 1 ? "employee" : "employees"} · total{" "}
          {formatPHP(totalNet)}
          {period.note ? ` · ${period.note}` : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="h-7 w-7" />
            </span>
            <p className="text-sm text-muted-foreground">
              No employees have been computed for this period yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map(({ entry, employee }) => (
            <Link key={employee.id} href={`/reports/${employee.id}`}>
              <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {`${employee.first_name[0] ?? ""}${employee.last_name[0] ?? ""}`.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{fullName(employee)}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.days_worked} days worked
                    </p>
                  </div>
                  <p
                    className={cn(
                      "font-semibold tabular-nums",
                      entry.net_weekly_pay <= 0 ? "text-destructive" : "text-success"
                    )}
                  >
                    {formatPHP(entry.net_weekly_pay)}
                  </p>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
