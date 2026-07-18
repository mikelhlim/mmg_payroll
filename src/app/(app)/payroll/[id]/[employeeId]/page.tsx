import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ComputeForm } from "@/components/payroll/compute-form";
import { formatPeriod } from "@/lib/payroll/period";
import {
  fullName,
  type Advance,
  type Employee,
  type Loan,
  type PayrollEntry,
  type PayrollPeriod,
} from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export default async function ComputeEmployeePage({
  params,
}: {
  params: Promise<{ id: string; employeeId: string }>;
}) {
  const { id, employeeId } = await params;
  const supabase = await createClient();

  const { data: periodRow } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!periodRow) notFound();
  const period = periodRow as PayrollPeriod;

  const [{ data: employeeRow }, { data: loanRows }, { data: advanceRows }, { data: entryRow }, { data: activeRows }] =
    await Promise.all([
      supabase.from("employees").select("*").eq("id", employeeId).maybeSingle(),
      supabase.from("loans").select("*").eq("employee_id", employeeId),
      supabase.from("advances").select("*").eq("employee_id", employeeId).eq("is_active", true),
      supabase
        .from("payroll_entries")
        .select("*")
        .eq("period_id", id)
        .eq("employee_id", employeeId)
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id")
        .eq("is_active", true)
        .order("last_name", { ascending: true }),
    ]);

  if (!employeeRow) notFound();
  const employee = employeeRow as Employee;

  // Stepper across the active roster.
  const order = (activeRows ?? []).map((r) => r.id as string);
  const index = Math.max(0, order.indexOf(employeeId));
  const prevId = index > 0 ? order[index - 1] : null;
  const nextId = index < order.length - 1 ? order[index + 1] : null;

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <Link
          href={`/payroll/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to run
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{fullName(employee)}</h1>
        <p className="text-muted-foreground">
          {formatPeriod(period.period_start, period.period_end)}
          {period.status === "finalized" ? " · finalized (read-only)" : ""}
        </p>
      </div>

      <ComputeForm
        periodId={id}
        periodStart={period.period_start}
        periodEnd={period.period_end}
        periodFinalized={period.status === "finalized"}
        employee={employee}
        loans={(loanRows ?? []) as Loan[]}
        advances={(advanceRows ?? []) as Advance[]}
        entry={(entryRow ?? null) as PayrollEntry | null}
        stepper={{
          index,
          total: order.length,
          prevHref: prevId ? `/payroll/${id}/${prevId}` : null,
          nextHref: nextId ? `/payroll/${id}/${nextId}` : null,
        }}
      />
    </div>
  );
}
