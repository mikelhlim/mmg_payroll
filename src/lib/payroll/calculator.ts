/**
 * Pure weekly payroll calculator. No I/O, no side effects — every amount is
 * integer centavos (see ../money.ts). This is the single source of truth for
 * the payroll math and is exercised directly by calculator.test.ts.
 *
 * Business rules (confirmed with the client):
 *   total_food_allowance  = days_worked × food_allowance_per_day
 *   total_sleep_allowance = days_worked × sleep_allowance_per_day
 *   base_wage             = days_worked × daily_wage
 *   weekly_salary         = base_wage + total_food_allowance + total_sleep_allowance
 *   overtime_amount       = overtime_days × overtime_fee   (fixed daily OT fee)
 *   gross_weekly_salary   = weekly_salary + overtime_amount
 *   total_deductions      = SSS + PagIBIG + PhilHealth contributions
 *                         + SSS loan + PagIBIG loan + Σ advances
 *   net_weekly_pay        = gross_weekly_salary − total_deductions
 *   Leave is unpaid (only days worked are paid); leave days are tracked
 *   for reporting but never enter the pay math.
 */
import { multiplyCentavos, sumCentavos } from "@/lib/money";

export interface PayrollRates {
  /** Fixed daily wage, in centavos. */
  dailyWageCentavos: number;
  /** Food allowance per day worked, in centavos. */
  foodAllowancePerDayCentavos: number;
  /** Sleep allowance per day worked, in centavos. */
  sleepAllowancePerDayCentavos: number;
  /** Fixed daily overtime fee, in centavos. */
  overtimeFeeCentavos: number;
}

export interface PayrollInputs {
  /** Days worked in the period (may be fractional, e.g. 5.5). */
  daysWorked: number;
  /** Days on (unpaid) leave — tracked, does not affect pay. */
  daysOnLeave: number;
  /** Number of overtime days rendered (may be fractional). */
  overtimeDays: number;

  // Deductions in centavos. These are the final, user-adjusted values;
  // loan/advance amounts are expected to already be capped at their balances
  // by the caller, but the calculator never produces a value below zero.
  sssContributionCentavos: number;
  pagibigContributionCentavos: number;
  philhealthContributionCentavos: number;
  sssLoanPaymentCentavos: number;
  pagibigLoanPaymentCentavos: number;
  /** One entry per advance being deducted this week, in centavos. */
  advancePaymentsCentavos: number[];
}

export interface PayrollResult {
  totalFoodAllowanceCentavos: number;
  totalSleepAllowanceCentavos: number;
  baseWageCentavos: number;
  weeklySalaryCentavos: number;
  overtimeAmountCentavos: number;
  grossWeeklySalaryCentavos: number;
  totalContributionsCentavos: number;
  totalLoanPaymentsCentavos: number;
  totalAdvanceDeductionCentavos: number;
  totalDeductionsCentavos: number;
  netWeeklyPayCentavos: number;
  /** True when net ≤ 0 — the UI must alert and block finalize. */
  isNetNonPositive: boolean;
}

const nonNeg = (n: number) => Math.max(0, Math.round(n || 0));

export function computePayroll(rates: PayrollRates, inputs: PayrollInputs): PayrollResult {
  const daysWorked = Math.max(0, inputs.daysWorked || 0);
  const overtimeDays = Math.max(0, inputs.overtimeDays || 0);

  // Food allowance is paid on regular (non-overtime) days: days_worked − overtime_days.
  const foodDays = Math.max(0, daysWorked - overtimeDays);
  const totalFoodAllowanceCentavos = multiplyCentavos(
    nonNeg(rates.foodAllowancePerDayCentavos),
    foodDays
  );
  const totalSleepAllowanceCentavos = multiplyCentavos(
    nonNeg(rates.sleepAllowancePerDayCentavos),
    daysWorked
  );
  const baseWageCentavos = multiplyCentavos(nonNeg(rates.dailyWageCentavos), daysWorked);

  const weeklySalaryCentavos =
    baseWageCentavos + totalFoodAllowanceCentavos + totalSleepAllowanceCentavos;

  const overtimeAmountCentavos = multiplyCentavos(nonNeg(rates.overtimeFeeCentavos), overtimeDays);

  const grossWeeklySalaryCentavos = weeklySalaryCentavos + overtimeAmountCentavos;

  const totalContributionsCentavos = sumCentavos([
    nonNeg(inputs.sssContributionCentavos),
    nonNeg(inputs.pagibigContributionCentavos),
    nonNeg(inputs.philhealthContributionCentavos),
  ]);

  const totalLoanPaymentsCentavos = sumCentavos([
    nonNeg(inputs.sssLoanPaymentCentavos),
    nonNeg(inputs.pagibigLoanPaymentCentavos),
  ]);

  const totalAdvanceDeductionCentavos = sumCentavos(
    (inputs.advancePaymentsCentavos ?? []).map(nonNeg)
  );

  const totalDeductionsCentavos =
    totalContributionsCentavos + totalLoanPaymentsCentavos + totalAdvanceDeductionCentavos;

  const netWeeklyPayCentavos = grossWeeklySalaryCentavos - totalDeductionsCentavos;

  return {
    totalFoodAllowanceCentavos,
    totalSleepAllowanceCentavos,
    baseWageCentavos,
    weeklySalaryCentavos,
    overtimeAmountCentavos,
    grossWeeklySalaryCentavos,
    totalContributionsCentavos,
    totalLoanPaymentsCentavos,
    totalAdvanceDeductionCentavos,
    totalDeductionsCentavos,
    netWeeklyPayCentavos,
    isNetNonPositive: netWeeklyPayCentavos <= 0,
  };
}
