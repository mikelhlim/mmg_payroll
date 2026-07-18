import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ageFromBirthdate,
  fullName,
  type Advance,
  type Employee,
  type Loan,
  type PayrollEntry,
} from "@/lib/types";
import { formatPHP } from "@/lib/money";
import { formatPeriod } from "@/lib/payroll/period";
import { ArrowLeft, Pencil, HandCoins, Landmark, CalendarClock } from "lucide-react";

type Period = { id: string; period_start: string; period_end: string; finalized_at: string | null };
type EntryWithPeriod = PayrollEntry & { payroll_periods: Period };
type LoanPayment = {
  id: string;
  loan_type: string;
  amount: number;
  balance_after: number;
  payroll_entries: { payroll_periods: Period };
};
type AdvancePayment = {
  id: string;
  amount: number;
  balance_after: number;
  advances: { label: string | null } | null;
  payroll_entries: { payroll_periods: Period };
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d + "T00:00:00"), "MMM d, yyyy");
  } catch {
    return d;
  }
}

export default async function EmployeeReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: employeeRow }, { data: loanRows }, { data: advanceRows }, { data: entryRows }, { data: loanPayRows }, { data: advPayRows }] =
    await Promise.all([
      supabase.from("employees").select("*").eq("id", id).maybeSingle(),
      supabase.from("loans").select("*").eq("employee_id", id),
      supabase.from("advances").select("*").eq("employee_id", id).order("created_at"),
      supabase
        .from("payroll_entries")
        .select("*, payroll_periods!inner(id, period_start, period_end, finalized_at, status)")
        .eq("employee_id", id)
        .eq("payroll_periods.status", "finalized"),
      supabase
        .from("payroll_loan_payments")
        .select("*, payroll_entries!inner(employee_id, payroll_periods(id, period_start, period_end, finalized_at))")
        .eq("payroll_entries.employee_id", id),
      supabase
        .from("payroll_advance_payments")
        .select("*, advances(label), payroll_entries!inner(employee_id, payroll_periods(id, period_start, period_end, finalized_at))")
        .eq("payroll_entries.employee_id", id),
    ]);

  if (!employeeRow) notFound();
  const employee = employeeRow as Employee;
  const loans = (loanRows ?? []) as Loan[];
  const advances = (advanceRows ?? []) as Advance[];
  const entries = ((entryRows ?? []) as EntryWithPeriod[]).sort((a, b) =>
    b.payroll_periods.period_start.localeCompare(a.payroll_periods.period_start)
  );
  const loanPayments = ((loanPayRows ?? []) as unknown as LoanPayment[]).sort((a, b) =>
    (b.payroll_entries.payroll_periods?.period_start ?? "").localeCompare(
      a.payroll_entries.payroll_periods?.period_start ?? ""
    )
  );
  const advancePayments = ((advPayRows ?? []) as unknown as AdvancePayment[]).sort((a, b) =>
    (b.payroll_entries.payroll_periods?.period_start ?? "").localeCompare(
      a.payroll_entries.payroll_periods?.period_start ?? ""
    )
  );

  const sssLoan = loans.find((l) => l.loan_type === "SSS");
  const pagibigLoan = loans.find((l) => l.loan_type === "PAGIBIG");
  const advancesBalance = advances.reduce((s, a) => s + a.current_balance, 0);
  const age = ageFromBirthdate(employee.birthdate);
  const totalLeave = entries.reduce((s, e) => s + e.days_on_leave, 0);

  return (
    <div className="space-y-6">
      <div className="animate-rise flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/reports"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All reports
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{fullName(employee)}</h1>
          {employee.nickname && <p className="text-muted-foreground">“{employee.nickname}”</p>}
        </div>
        <Link href={`/employees/${employee.id}`} className={buttonVariants({ variant: "outline" })}>
          <Pencil className="h-4 w-4" /> Edit profile
        </Link>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Nickname", employee.nickname ?? "—"],
            ["Age", age !== null ? `${age} years` : "—"],
            ["Birthday", fmtDate(employee.birthdate)],
            ["Employment date", fmtDate(employee.employment_date)],
            ["SSS no.", employee.sss_number ?? "—"],
            ["PhilHealth no.", employee.philhealth_number ?? "—"],
            ["Pag-IBIG no.", employee.pagibig_number ?? "—"],
            ["Daily wage", formatPHP(employee.daily_wage)],
            ["Leave days taken", `${totalLeave}`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="font-medium">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Balances */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chart-5/10 text-chart-5">
              <Landmark className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">SSS loan balance</p>
              <p className="text-lg font-bold tabular-nums">{formatPHP(sssLoan?.current_balance ?? 0)}</p>
              {sssLoan && (
                <p className="text-[11px] text-muted-foreground">
                  of {formatPHP(sssLoan.principal)}
                  {sssLoan.start_date ? ` · since ${sssLoan.start_date}` : ""}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chart-3/10 text-chart-3">
              <Landmark className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Pag-IBIG loan balance</p>
              <p className="text-lg font-bold tabular-nums">{formatPHP(pagibigLoan?.current_balance ?? 0)}</p>
              {pagibigLoan && (
                <p className="text-[11px] text-muted-foreground">
                  of {formatPHP(pagibigLoan.principal)}
                  {pagibigLoan.start_date ? ` · since ${pagibigLoan.start_date}` : ""}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HandCoins className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Advances balance</p>
              <p className="text-lg font-bold tabular-nums">{formatPHP(advancesBalance)}</p>
              {advances.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {advances.length} advance{advances.length === 1 ? "" : "s"} · of{" "}
                  {formatPHP(advances.reduce((s, a) => s + a.total_advance, 0))}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payslip history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5 text-primary" /> Payslip history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No finalized payroll yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Period</th>
                    <th className="py-2 pr-4 font-medium">Days</th>
                    <th className="py-2 pr-4 font-medium">Gross</th>
                    <th className="py-2 pr-4 font-medium">Deductions</th>
                    <th className="py-2 pr-4 text-right font-medium">Net pay</th>
                    <th className="py-2 text-right font-medium">Payslip</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">
                        {formatPeriod(e.payroll_periods.period_start, e.payroll_periods.period_end)}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">{e.days_worked}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{formatPHP(e.gross_weekly_salary)}</td>
                      <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">
                        − {formatPHP(e.total_deductions)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-success">
                        {formatPHP(e.net_weekly_pay)}
                      </td>
                      <td className="py-2.5 text-right">
                        <a
                          href={`/payroll/${e.payroll_periods.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Loan payment history</CardTitle>
          </CardHeader>
          <CardContent>
            {loanPayments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No loan payments yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {loanPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <Badge variant="secondary" className="mr-2">
                        {p.loan_type}
                      </Badge>
                      <span className="text-muted-foreground">
                        {p.payroll_entries.payroll_periods
                          ? formatPeriod(
                              p.payroll_entries.payroll_periods.period_start,
                              p.payroll_entries.payroll_periods.period_end
                            )
                          : "—"}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium tabular-nums">{formatPHP(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">bal {formatPHP(p.balance_after)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Advance payment history</CardTitle>
          </CardHeader>
          <CardContent>
            {advancePayments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No advance payments yet.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {advancePayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.advances?.label ?? "Advance"}</p>
                      <span className="text-xs text-muted-foreground">
                        {p.payroll_entries.payroll_periods
                          ? formatPeriod(
                              p.payroll_entries.payroll_periods.period_start,
                              p.payroll_entries.payroll_periods.period_end
                            )
                          : "—"}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium tabular-nums">{formatPHP(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">bal {formatPHP(p.balance_after)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
