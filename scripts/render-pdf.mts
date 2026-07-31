// Dev-only: render a finalized period's payslip PDF to a file for inspection.
//   npx tsx --env-file=.env.local scripts/render-pdf.mts <periodId> <outPath>
import { renderToFile } from "@react-pdf/renderer";
import { createElement } from "react";
import { createClient } from "@supabase/supabase-js";
import { PayslipDocument } from "../src/lib/pdf/payslip-document";

const periodId = process.argv[2];
const outPath = process.argv[3] ?? "/tmp/payslip.pdf";

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const { data: period } = await c
  .from("payroll_periods")
  .select("*")
  .eq("id", periodId)
  .maybeSingle();
const { data: entries } = await c
  .from("payroll_entries")
  .select("*, employees(*)")
  .eq("period_id", periodId);
const { data: departments } = await c
  .from("departments")
  .select("*")
  .order("sort_order", { ascending: true })
  .order("name", { ascending: true });

const employeeIds = [...new Set((entries ?? []).map((e) => e.employee_id))];
const { data: loanRows } = await c
  .from("loans")
  .select("employee_id, loan_type, current_balance")
  .in("employee_id", employeeIds);
const { data: advanceRows } = await c
  .from("advances")
  .select("employee_id, current_balance")
  .eq("is_active", true)
  .in("employee_id", employeeIds);
const sssBalanceByEmp = new Map();
const pagibigBalanceByEmp = new Map();
for (const l of loanRows ?? []) {
  if (l.loan_type === "SSS") sssBalanceByEmp.set(l.employee_id, l.current_balance);
  if (l.loan_type === "PAGIBIG") pagibigBalanceByEmp.set(l.employee_id, l.current_balance);
}
const advBalanceByEmp = new Map();
for (const a of advanceRows ?? []) {
  advBalanceByEmp.set(a.employee_id, (advBalanceByEmp.get(a.employee_id) ?? 0) + a.current_balance);
}

const rows = (entries ?? []).map((e) => {
  const { employees, ...entry } = e;
  return {
    entry,
    employee: employees,
    sssLoanBalance: sssBalanceByEmp.get(employees.id) ?? 0,
    pagibigLoanBalance: pagibigBalanceByEmp.get(employees.id) ?? 0,
    advancesBalance: advBalanceByEmp.get(employees.id) ?? 0,
  };
});

await renderToFile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createElement(PayslipDocument, { period, rows, departments: departments ?? [] }) as any,
  outPath
);
console.log(`wrote ${outPath} (${rows.length} payslips + summary)`);
