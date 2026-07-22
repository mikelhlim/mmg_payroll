"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { savePayrollEntry, coverShortfallWithAdvance } from "@/lib/actions/payroll";
import { buildEntryRow } from "@/lib/payroll/build-entry";
import { daysMatch, periodDays } from "@/lib/payroll/validation";
import { MAX_ADVANCES } from "@/lib/validation/obligations";
import type { PayrollEntryInput } from "@/lib/validation/payroll";
import { type Advance, type Employee, type Loan, type LoanType, type PayrollEntry } from "@/lib/types";
import { formatPHP } from "@/lib/money";
import { AdvanceDialog } from "@/components/employees/advances-card";
import { LoanDialog, LOAN_LABELS } from "@/components/employees/loans-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  HandCoins,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
} from "lucide-react";

type FormValues = {
  days_worked: number;
  days_on_leave: number;
  overtime_days: number;
  sleep_days: number;
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
    sleep_days: entry?.sleep_days ?? 0,
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

const LOAN_TYPES: LoanType[] = ["SSS", "PAGIBIG"];

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
  const [savedNegative, setSavedNegative] = useState(false);
  const [coveringShortfall, setCoveringShortfall] = useState(false);
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
    sleep_days: Number(v.sleep_days) || 0,
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
  const loanByType: Record<LoanType, Loan | undefined> = { SSS: sssLoan, PAGIBIG: pagibigLoan };
  const loanFieldByType: Record<LoanType, "sss_loan_payment" | "pagibig_loan_payment"> = {
    SSS: "sss_loan_payment",
    PAGIBIG: "pagibig_loan_payment",
  };

  // Auto-save the unfinished run when navigating away with unsaved changes.
  const savedSigRef = useRef(JSON.stringify(defaults(employee, advances, entry)));
  const autosaveRef = useRef<() => void>(() => {});
  autosaveRef.current = () => {
    if (!ro && JSON.stringify(values) !== savedSigRef.current) {
      void savePayrollEntry(periodId, employee.id, toInput(values)).then(() => router.refresh());
    }
  };
  useEffect(() => () => autosaveRef.current(), []);

  // A shortfall just covered (this period, unsaved-input-independent) is shown
  // as net = 0 until the user changes an input again, at which point it's
  // stale and we fall back to the live (possibly negative again) computation.
  const [shortfallState, setShortfallState] = useState<{ amount: number; valuesSig: string } | null>(
    entry?.shortfall_covered && entry.shortfall_covered > 0
      ? { amount: entry.shortfall_covered, valuesSig: JSON.stringify(defaults(employee, advances, entry)) }
      : null
  );
  useEffect(() => {
    if (shortfallState && JSON.stringify(values) !== shortfallState.valuesSig) {
      setShortfallState(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)]);

  function onSubmit(v: FormValues) {
    startTransition(async () => {
      const res = await savePayrollEntry(periodId, employee.id, toInput(v));
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      savedSigRef.current = JSON.stringify(v);
      setShortfallState(null);
      if (res.isNetNegative) {
        setSavedNegative(true);
        toast.warning("Saved, but net pay is negative — please review.");
      } else {
        setSavedNegative(false);
        toast.success(`Saved — net ${formatPHP(res.netWeeklyPay)}.`);
      }
      router.refresh();
      if (stepper.nextHref) router.push(stepper.nextHref);
    });
  }

  async function handleCoverShortfall() {
    setCoveringShortfall(true);
    const res = await coverShortfallWithAdvance(periodId, employee.id, toInput(values));
    setCoveringShortfall(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    toast.success(
      res.foldedIntoExisting
        ? `Covered a ${formatPHP(res.shortfall)} shortfall by adding it to an existing advance (5-advance limit reached).`
        : `Covered a ${formatPHP(res.shortfall)} shortfall with a new advance.`
    );
    savedSigRef.current = JSON.stringify(values);
    setShortfallState({ amount: res.shortfall, valuesSig: JSON.stringify(values) });
    router.refresh();
  }

  const num = (name: keyof FormValues) => register(name, { valueAsNumber: true, disabled: ro });

  // Days worked auto-fills leave = period days − worked, and defaults sleep
  // days to match days worked (both stay independently editable afterward).
  // Neither sleep days nor overtime days may ever exceed days worked.
  const daysWorkedReg = register("days_worked", {
    valueAsNumber: true,
    disabled: ro,
    onChange: (e) => {
      if (ro) return;
      const w = Number(e.target.value) || 0;
      setValue("days_on_leave", Math.max(0, expectedDays - w), { shouldDirty: true });
      setValue("sleep_days", w, { shouldDirty: true });
      if ((Number(values.overtime_days) || 0) > w) {
        setValue("overtime_days", w, { shouldDirty: true });
      }
    },
  });
  const sleepDaysReg = register("sleep_days", {
    valueAsNumber: true,
    disabled: ro,
    onChange: (e) => {
      if (ro) return;
      const w = Number(values.days_worked) || 0;
      if ((Number(e.target.value) || 0) > w) setValue("sleep_days", w, { shouldDirty: true });
    },
  });
  const overtimeDaysReg = register("overtime_days", {
    valueAsNumber: true,
    disabled: ro,
    onChange: (e) => {
      if (ro) return;
      const w = Number(values.days_worked) || 0;
      if ((Number(e.target.value) || 0) > w) setValue("overtime_days", w, { shouldDirty: true });
    },
  });

  // A loan repayment or advance deduction can never exceed its balance (loans
  // are additionally capped at their original principal).
  const loanPaymentReg = (type: LoanType, loan: Loan | undefined) => {
    const cap = loan ? Math.min(loan.current_balance, loan.principal) : 0;
    return register(loanFieldByType[type], {
      valueAsNumber: true,
      disabled: ro,
      onChange: (e) => {
        if (ro) return;
        if ((Number(e.target.value) || 0) > cap) {
          setValue(loanFieldByType[type], cap, { shouldDirty: true });
        }
      },
    });
  };
  const advancePaymentReg = (a: Advance) =>
    register(`advances.${a.id}` as const, {
      valueAsNumber: true,
      disabled: ro,
      onChange: (e) => {
        if (ro) return;
        if ((Number(e.target.value) || 0) > a.current_balance) {
          setValue(`advances.${a.id}` as const, a.current_balance, { shouldDirty: true });
        }
      },
    });

  // Display helpers for the formula labels.
  const dw = Number(values.days_worked) || 0;
  const otd = Number(values.overtime_days) || 0;
  const sld = Number(values.sleep_days) || 0;
  const foodDays = Math.max(0, dw - otd);
  // Finalized entries are read-only: show the stored, finalized figures (rates
  // and the food rule may have changed since), not a live recompute. Drafts
  // show the live preview.
  const display = ro && entry ? entry : row;
  const baseWage =
    display.weekly_salary - display.total_food_allowance - display.total_sleep_allowance;

  const shortfallCoveredNow = ro ? (entry?.shortfall_covered ?? 0) > 0 : shortfallState !== null;
  const shortfallAmountShown = ro ? (entry?.shortfall_covered ?? 0) : (shortfallState?.amount ?? 0);
  const shownNet = shortfallCoveredNow ? 0 : display.net_weekly_pay;
  const shownNegative = shortfallCoveredNow ? false : shownNet < 0;
  const canCoverShortfall = !ro && !shortfallCoveredNow && row.net_weekly_pay < 0;
  const atAdvanceCap = advances.length >= MAX_ADVANCES;

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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
                <Label htmlFor="sleep_days">Sleep days</Label>
                <Input id="sleep_days" type="number" step="0.5" min="0" max={dw} {...sleepDaysReg} />
                <p className="text-xs text-muted-foreground">
                  × {formatPHP(employee.sleep_allowance_per_day)}/day
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overtime_days">Overtime days</Label>
                <Input id="overtime_days" type="number" step="0.5" min="0" max={dw} {...overtimeDaysReg} />
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
            {(sssLoan || pagibigLoan || !ro) && (
              <div>
                <p className="mb-2 text-sm font-semibold text-muted-foreground">Government loans</p>
                <div className="space-y-3">
                  {LOAN_TYPES.map((type) => {
                    const loan = loanByType[type];
                    if (ro && !loan) return null;
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{LOAN_LABELS[type]}</p>
                          {loan ? (
                            <p className="text-xs text-muted-foreground">
                              Balance {formatPHP(loan.current_balance)} of{" "}
                              {formatPHP(loan.principal)}
                              {loan.start_date ? ` · since ${loan.start_date}` : ""}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">No loan on record.</p>
                          )}
                        </div>
                        {!ro && (
                          <LoanDialog
                            employeeId={employee.id}
                            loanType={type}
                            loan={loan}
                            trigger={
                              loan ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Edit ${LOAN_LABELS[type]}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <Button type="button" variant="outline" size="sm">
                                  <Plus className="h-3.5 w-3.5" /> Add
                                </Button>
                              )
                            }
                          />
                        )}
                        {loan && (
                          <div className="w-40">
                            <MoneyInput
                              aria-label={`${LOAN_LABELS[type]} repayment`}
                              disabled={ro}
                              {...loanPaymentReg(type, loan)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                      {!ro && (
                        <AdvanceDialog
                          employeeId={employee.id}
                          advance={a}
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${a.label ?? "advance"}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                      )}
                      <div className="w-40">
                        <MoneyInput
                          aria-label={`Deduct from ${a.label ?? "advance"}`}
                          disabled={ro}
                          {...advancePaymentReg(a)}
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
              formula={
                ro ? undefined : `${sld} sleep days × ${formatPHP(employee.sleep_allowance_per_day)}`
              }
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
            {sssLoan && <Line label="SSS loan" value={`− ${formatPHP(display.sss_loan_payment)}`} />}
            {pagibigLoan && (
              <Line label="Pag-IBIG loan" value={`− ${formatPHP(display.pagibig_loan_payment)}`} />
            )}
            <Line label="Advances" value={`− ${formatPHP(display.total_advance_deduction)}`} />
            <Line
              label="Total deductions"
              value={`− ${formatPHP(display.total_deductions)}`}
              strong
            />
            {shortfallCoveredNow && (
              <Line
                label="Shortfall covered by advance"
                value={`+ ${formatPHP(shortfallAmountShown)}`}
              />
            )}
            <div className="my-1 border-t" />
            <div
              className={cn(
                "flex items-center justify-between rounded-xl px-3 py-2.5 text-lg font-bold",
                shownNegative ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
              )}
            >
              <span>Net pay</span>
              <span className="tabular-nums">{formatPHP(shownNet)}</span>
            </div>
            {shortfallCoveredNow && (
              <p className="text-xs text-success">
                {`Resolved: a ${formatPHP(shortfallAmountShown)} advance was issued to cover this week's shortfall.`}
              </p>
            )}
            {shownNegative && !ro && (
              <div className="space-y-2">
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Net pay is negative. Reduce deductions, or cover the shortfall with a new
                  advance, before finalizing this period.
                </p>
                {canCoverShortfall && (
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
                      <HandCoins className="h-3.5 w-3.5" />
                      {` Cover ${formatPHP(Math.abs(row.net_weekly_pay))} shortfall with a new advance`}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cover this shortfall with a new advance?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {atAdvanceCap
                            ? `${employee.first_name} already has ${MAX_ADVANCES} active advances, so this ${formatPHP(Math.abs(row.net_weekly_pay))} shortfall is added to the most recently created one instead of opening a new advance. This sets this week's net pay to ₱0.`
                            : `This creates a new ${formatPHP(Math.abs(row.net_weekly_pay))} advance for ${employee.first_name} and sets this week's net pay to ₱0. The advance balance is repaid via normal deductions in this or future payroll runs.`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction disabled={coveringShortfall} onClick={handleCoverShortfall}>
                          {coveringShortfall && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                          Cover shortfall
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
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
        {savedNegative && <span className="sr-only">Saved with negative net pay</span>}
      </div>
    </form>
  );
}
