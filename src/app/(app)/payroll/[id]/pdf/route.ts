import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { PayslipDocument, type PayslipRow } from "@/lib/pdf/payslip-document";
import type { Department, Employee, PayrollEntry, PayrollPeriod } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!period) return new Response("Payroll period not found", { status: 404 });

  // Embed the employee for each entry (payroll_entries.employee_id → employees).
  const [{ data: entries, error }, { data: departmentRows }] = await Promise.all([
    supabase.from("payroll_entries").select("*, employees(*)").eq("period_id", id),
    supabase
      .from("departments")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  if (error) return new Response(error.message, { status: 500 });
  const departments = (departmentRows ?? []) as Department[];

  // Remaining balances shown on the payslip are live, not a finalize-time
  // snapshot (see the comment on PayslipRow) — fetched fresh for whichever
  // employees are in this period.
  const employeeIds = [...new Set((entries ?? []).map((e) => e.employee_id as string))];
  const [{ data: loanRows }, { data: advanceRows }] = await Promise.all([
    supabase.from("loans").select("employee_id, loan_type, current_balance").in("employee_id", employeeIds),
    supabase
      .from("advances")
      .select("employee_id, current_balance")
      .eq("is_active", true)
      .in("employee_id", employeeIds),
  ]);
  const sssBalanceByEmp = new Map<string, number>();
  const pagibigBalanceByEmp = new Map<string, number>();
  for (const l of loanRows ?? []) {
    if (l.loan_type === "SSS") sssBalanceByEmp.set(l.employee_id, l.current_balance);
    if (l.loan_type === "PAGIBIG") pagibigBalanceByEmp.set(l.employee_id, l.current_balance);
  }
  const advBalanceByEmp = new Map<string, number>();
  for (const a of advanceRows ?? []) {
    advBalanceByEmp.set(a.employee_id, (advBalanceByEmp.get(a.employee_id) ?? 0) + a.current_balance);
  }

  const rows: PayslipRow[] = (entries ?? [])
    .filter((e) => e.employees)
    .map((e) => {
      const { employees, ...entry } = e as PayrollEntry & { employees: Employee };
      return {
        entry: entry as PayrollEntry,
        employee: employees as Employee,
        sssLoanBalance: sssBalanceByEmp.get(employees.id) ?? 0,
        pagibigLoanBalance: pagibigBalanceByEmp.get(employees.id) ?? 0,
        advancesBalance: advBalanceByEmp.get(employees.id) ?? 0,
      };
    });

  if (rows.length === 0) {
    return new Response("No payroll entries to print for this period.", { status: 404 });
  }

  // PayslipDocument returns a <Document>; cast past renderToBuffer's strict
  // ReactElement<DocumentProps> param (it renders the component fine at runtime).
  const element = createElement(PayslipDocument, {
    period: period as PayrollPeriod,
    rows,
    departments,
  }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(element);

  const filename = `payroll-${period.period_start}_to_${period.period_end}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
