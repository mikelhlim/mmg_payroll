"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { savePayrollEntry } from "@/lib/actions/payroll";
import { buildEntryRow } from "@/lib/payroll/build-entry";
import { daysMatch, periodDays } from "@/lib/payroll/validation";
import { MAX_ADVANCES } from "@/lib/validation/obligations";
import type { PayrollEntryInput } from "@/lib/validation/payroll";
import { type Advance, type Employee, type Loan, type PayrollEntry } from "@/lib/types";
import { formatPHP } from "@/lib/money";
import { AdvanceDialog } from "@/components/employees/advances-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Loader2,
  Lock,
  Plus,
  Save,
} from "lucide-react";

type FormValues = {
  days_worked: number;
  days_on_leave: number;
  overtime_days: number;
  sss_contribution: number;
  pagibig_contribution: number;
  philhealth_contribution: number;
  sss_loan_payment: number;
  pagibig_loan_payment: number;
  advances: Record<string, number>;
};

function defaults(employee: Employee, advances: Advance[], entry: PayrollEntry | null): FormValues {
  const allocById = new Map((entry?.advance_allocations ?? []).map((a) => [a.advance_id, a.amount]));
  return {
    days_worked: entry?.days_worked ?? 0,
    days_on_leave: entry?.days_on_leave ?? 0,
    overtime_days: entry?.overtime_days ?? 0,
    sss_contribution: entry?.sss_contribution ?? employee.sss_contribution,
    pagibig_contribution: entry?.pagibig_contribution ?? employee.pagibig_contribution,
    philhealth_contribution: entry?.philhealth_contribution ?? employee.philhealth_contribution,
    sss_loan_payment: entry?.sss_loan_payment ?? 0,
    pagibig_loan_payment: entry?.pagibig_loan_payment ?? 0,
    advances: Object.fromEntries(advances.map((a) => [a.id, allocById.get(a.id) ?? 0])),
  };
}

function Line({
  label,
  formula,
  value,
  strong,
}: {
  label: string;
  formula?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div
        className={cn("flex items-center justify-between text-sm", strong && "font-semibold")}
      >
        <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      {formula && <p className="text-[11px] leading-tight text-muted-foreground/80">{formula}</p>}
    </div>
  );
}

export function ComputeForm({
  periodId,
  periodStart,
  periodEnd,
  periodFinalized,
  employee,
  loans,
  advances,
  entry,
  stepper,
}: {
  periodId: string;
  periodStart: string;
  periodEnd: string;
  periodFinalized: boolean;
  employee: Employee;
  loans: Loan[];
  advances: Advance[];
  entry: PayrollEntry | null;
  stepper: { index: number; total: number; prevHref: string | null; nextHref: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedNonPositive, setSavedNonPositive] = useState(false);
  const ro = periodFinalized; // read-only

  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: defaults(employee, advances, entry),
  });

  const values = watch();

  const range = { period_start: periodStart, period_end: periodEnd };
  const expectedDays = periodDays(range);
  const daysEntered = (Number(values.days_worked) || 0) + (Number(values.days_on_leave) || 0);
  const daysOk = daysMatch(range, values.days_worked, values.days_on_leave);

  const toInput = (v: FormValues): PayrollEntryInput => ({
    days_worked: Number(v.days_worked) || 0,
    days_on_leave: Number(v.days_on_leave) || 0,
    overtime_days: Number(v.overtime_days) || 0,
    sss_contribution: Number(v.sss_contribution) || 0,
    pagibig_contribution: Number(v.pagibig_contribution) || 0,
    philhealth_contribution: Number(v.philhealth_contribution) || 0,
    sss_loan_payment: Number(v.sss_loan_payment) || 0,
    pagibig_loan_payment: Number(v.pagibig_loan_payment) || 0,
    advance_allocations: advances.map((a) => ({
      advance_id: a.id,
      amount: Number(v.advances?.[a.id]) || 0,
    })),
  });

  // Live preview — identical math to the server (buildEntryRow is pure).
  const { row } = useMemo(
    () => buildEntryRow(employee, loans, advances, toInput(values)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(values), employee.id]
  );

  const sssLoan = loans.find((l) => l.loan_type === "SSS");
  const pagibigLoan = loans.find((l) => l.loan_type === "PAGIBIG");

  // Auto-save the unfinished run when navigating away with unsaved changes.
  const savedSigRef = useRef(JSON.stringify(defaults(employee, advances, entry)));
  const autosaveRef = useRef<() => void>(() => {});
  autosaveRef.current = () => {
    if (!ro && JSON.stringify(values) !== savedSigRef.current) {
      void savePayrollEntry(periodId, employee.id, toInput(values)).then(() => router.refresh());
    }
  };
  useEffect(() => () => autosaveRef.current(), []);

  function onSubmit(v: FormValues) {
    startTransition(async () => {
      const res = await savePayrollEntry(periodId, employee.id, toInput(v));
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      savedSigRef.current = JSON.stringify(v);
      if (res.isNetNonPositive) {
        setSavedNonPositive(true);
        toast.warning("Saved, but net pay is ₱0 or negative — please review.");
      } else {
        setSavedNonPositive(false);
        toast.success(`Saved — net ${formatPHP(res.netWeeklyPay)}.`);
      }
      router.refresh();
      if (stepper.nextHref) router.push(stepper.nextHref);
    });
  }

  const num = (name: keyof FormValues) => register(name, { valueAsNumber: true, disabled: ro });

  // Days worked auto-fills leave = period days − worked (when worked < period).
  const daysWorkedReg = register("days_worked", {
    valueAsNumber: true,
    disabled: ro,
    onChange: (e) => {
      if (ro) return;
      const w = Number(e.target.value) || 0;
      setValue("days_on_leave", Math.max(0, expectedDays - w), { shouldDirty: true });
    },
  });

  // Display helpers for the formula labels.
  const dw = Number(values.days_worked) || 0;
  const otd = Number(values.overtime_days) || 0;
  const foodDays = Math.max(0, dw - otd);
  // Finalized entries are read-only: show the stored, finalized figures (rates
  // and the food rule may have changed since), not a live recompute. Drafts
  // show the live preview.
  const display = ro && entry ? entry : row;
  const displayNonPositive = display.net_weekly_pay <= 0;
  const baseWage =
    display.weekly_salary - display.total_food_allowance - display.total_sleep_allowance;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Inputs */}
      <div className="space-y-6">
        {ro && (
          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            This run is finalized — read-only. Use <span className="font-medium">Amend</span> on the
            run to make changes.
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="days_worked">Days worked</Label>
                <Input id="days_worked" type="number" step="0.5" min="0" {...daysWorkedReg} />
                <p className="text-xs text-muted-foreground">
                  {formatPHP(employee.daily_wage)} / day
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="days_on_leave">Days on leave</Label>
                <Input id="days_on_leave" type="number" step="0.5" min="0" {...num("days_on_leave")} />
                <p className="text-xs text-muted-foreground">auto-filled from days worked</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overtime_days">Overtime days</Label>
                <Input id="overtime_days" type="number" step="0.5" min="0" {...num("overtime_days")} />
                <p className="text-xs text-muted-foreground">
                  × {formatPHP(employee.overtime_fee)}/day
                </p>
              </div>
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs",
                daysOk ? "bg-success/10 text-success" : "bg-warning/15 text-warning-foreground"
              )}
            >
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              {daysOk
                ? `Days worked + leave = ${daysEntered} of ${expectedDays} — accounts for the whole period.`
                : `Days worked + leave = ${daysEntered}, but this pay period is ${expectedDays} days. Adjust to finalize (a draft can still be saved).`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deductions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                Statutory contributions
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sss_contribution">SSS</Label>
                  <MoneyInput id="sss_contribution" {...num("sss_contribution")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pagibig_contribution">Pag-IBIG</Label>
                  <MoneyInput id="pagibig_contribution" {...num("pagibig_contribution")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="philhealth_contribution">PhilHealth</Label>
                  <MoneyInput id="philhealth_contribution" {...num("philhealth_contribution")} />
                </div>
              </div>
            </div>

            {(sssLoan || pagibigLoan) && (
              <div>
                <p className="mb-2 text-sm font-semibold text-muted-foreground">Loan repayments</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {sssLoan && (
                    <div className="space-y-1.5">
                      <Label htmlFor="sss_loan_payment">SSS loan</Label>
                      <MoneyInput id="sss_loan_payment" {...num("sss_loan_payment")} />
                      <p className="text-xs text-muted-foreground">
                        Balance {formatPHP(sssLoan.current_balance)} of{" "}
                        {formatPHP(sssLoan.principal)}
                        {sssLoan.start_date ? ` · since ${sssLoan.start_date}` : ""}
                      </p>
                    </div>
                  )}
                  {pagibigLoan && (
                    <div className="space-y-1.5">
                      <Label htmlFor="pagibig_loan_payment">Pag-IBIG loan</Label>
                      <MoneyInput id="pagibig_loan_payment" {...num("pagibig_loan_payment")} />
                      <p className="text-xs text-muted-foreground">
                        Balance {formatPHP(pagibigLoan.current_balance)} of{" "}
                        {formatPHP(pagibigLoan.principal)}
                        {pagibigLoan.start_date ? ` · since ${pagibigLoan.start_date}` : ""}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(advances.length > 0 || !ro) && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-muted-foreground">Advances</p>
                  {!ro && advances.length < MAX_ADVANCES && (
                    <AdvanceDialog
                      employeeId={employee.id}
                      trigger={
                        <Button type="button" variant="outline" size="sm">
                          <Plus className="h-3.5 w-3.5" /> Add advance
                        </Button>
                      }
                    />
                  )}
                </div>
                {advances.length === 0 && (
                  <p className="text-xs text-muted-foreground">No active advances.</p>
                )}
                <div className="space-y-3">
                  {advances.map((a) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.label ?? "Advance"}</p>
                        <p className="text-xs text-muted-foreground">
                          Balance {formatPHP(a.current_balance)} of {formatPHP(a.total_advance)}
                          {a.start_date ? ` · since ${a.start_date}` : ""}
                        </p>
                      </div>
                      <div className="w-40">
                        <MoneyInput
                          aria-label={`Deduct from ${a.label ?? "advance"}`}
                          disabled={ro}
                          {...register(`advances.${a.id}` as const, {
                            valueAsNumber: true,
                            disabled: ro,
                          })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live summary */}
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly pay</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Line
              label="Basic wage"
              formula={ro ? undefined : `${dw} days × ${formatPHP(employee.daily_wage)}`}
              value={formatPHP(baseWage)}
            />
            <Line
              label="Food allowance"
              formula={
                ro
                  ? undefined
                  : `(${dw} − ${otd} OT) = ${foodDays} days × ${formatPHP(employee.food_allowance_per_day)}`
              }
              value={formatPHP(display.total_food_allowance)}
            />
            <Line
              label="Sleep allowance"
              formula={ro ? undefined : `${dw} days × ${formatPHP(employee.sleep_allowance_per_day)}`}
              value={formatPHP(display.total_sleep_allowance)}
            />
            <Line
              label="Overtime"
              formula={ro ? undefined : `${otd} days × ${formatPHP(employee.overtime_fee)}`}
              value={formatPHP(display.overtime_amount)}
            />
            <div className="my-1 border-t" />
            <Line label="Gross weekly" value={formatPHP(display.gross_weekly_salary)} strong />
            <div className="my-1 border-t" />
            <Line
              label="Contributions"
              formula={
                ro
                  ? undefined
                  : `SSS ${formatPHP(display.sss_contribution)} + Pag-IBIG ${formatPHP(display.pagibig_contribution)} + PhilHealth ${formatPHP(display.philhealth_contribution)}`
              }
              value={`− ${formatPHP(display.sss_contribution + display.pagibig_contribution + display.philhealth_contribution)}`}
            />
            {sssLoan && (
              <Line label="SSS loan" value={`− ${formatPHP(display.sss_loan_payment)}`} />
            )}
            {pagibigLoan && (
              <Line label="Pag-IBIG loan" value={`− ${formatPHP(display.pagibig_loan_payment)}`} />
            )}
            <Line label="Advances" value={`− ${formatPHP(display.total_advance_deduction)}`} />
            <Line
              label="Total deductions"
              value={`− ${formatPHP(display.total_deductions)}`}
              strong
            />
            <div className="my-1 border-t" />
            <div
              className={cn(
                "flex items-center justify-between rounded-xl px-3 py-2.5 text-lg font-bold",
                displayNonPositive
                  ? "bg-destructive/10 text-destructive"
                  : "bg-success/10 text-success"
              )}
            >
              <span>Net pay</span>
              <span className="tabular-nums">{formatPHP(display.net_weekly_pay)}</span>
            </div>
            {displayNonPositive && !ro && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Net pay is ₱0 or negative. Reduce deductions before finalizing this period.
              </p>
            )}
          </CardContent>
        </Card>

        {!ro && (
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            {stepper.nextHref ? "Save & next" : "Save"}
          </Button>
        )}

        <div className="flex items-center justify-between text-sm">
          {stepper.prevHref ? (
            <Link
              href={stepper.prevHref}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <ArrowLeft className="h-4 w-4" /> Prev
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            {stepper.index + 1} of {stepper.total}
          </span>
          {stepper.nextHref ? (
            <Link
              href={stepper.nextHref}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Next <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <span />
          )}
        </div>
        {savedNonPositive && <span className="sr-only">Saved with non-positive net pay</span>}
      </div>
    </form>
  );
}
