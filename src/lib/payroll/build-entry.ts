import { computePayroll, type PayrollResult } from "./calculator";
import { toCentavos, fromCentavos } from "@/lib/money";
import type { Advance, Employee, Loan } from "@/lib/types";
import type { PayrollEntryInput } from "@/lib/validation/payroll";

export type EntryRow = {
  days_worked: number;
  days_on_leave: number;
  overtime_days: number;
  sleep_days: number;
  daily_wage: number;
  overtime_fee: number;
  food_allowance_per_day: number;
  sleep_allowance_per_day: number;
  total_food_allowance: number;
  total_sleep_allowance: number;
  weekly_salary: number;
  overtime_amount: number;
  gross_weekly_salary: number;
  // Statutory contributions are no longer collected; these columns are kept
  // for backward compatibility with historical entries and always write 0
  // going forward.
  sss_contribution: number;
  pagibig_contribution: number;
  philhealth_contribution: number;
  sss_loan_payment: number;
  pagibig_loan_payment: number;
  total_advance_deduction: number;
  total_deductions: number;
  net_weekly_pay: number;
  advance_allocations: { advance_id: string; amount: number }[];
};

/**
 * Authoritative computation for one employee's weekly entry. Rates are
 * snapshotted from the employee profile; loan/advance payments are capped at
 * their current balances. Pure — no I/O — so it runs identically on the server
 * (savePayrollEntry) and can be mirrored client-side for the live preview.
 */
export function buildEntryRow(
  employee: Employee,
  loans: Loan[],
  advances: Advance[],
  input: PayrollEntryInput
): { row: EntryRow; result: PayrollResult } {
  const sssLoan = loans.find((l) => l.loan_type === "SSS");
  const pagibigLoan = loans.find((l) => l.loan_type === "PAGIBIG");
  // A repayment can never exceed the loan's remaining balance or its
  // original principal (defense in depth — see trg_loan_payment_caps).
  const sssLoanPay = Math.min(
    input.sss_loan_payment,
    sssLoan?.current_balance ?? 0,
    sssLoan?.principal ?? 0
  );
  const pagibigLoanPay = Math.min(
    input.pagibig_loan_payment,
    pagibigLoan?.current_balance ?? 0,
    pagibigLoan?.principal ?? 0
  );

  const advById = new Map(advances.map((a) => [a.id, a]));
  const allocations = input.advance_allocations
    .map((a) => ({
      advance_id: a.advance_id,
      amount: Math.min(a.amount, advById.get(a.advance_id)?.current_balance ?? 0),
    }))
    .filter((a) => a.amount > 0 && advById.has(a.advance_id));

  const result = computePayroll(
    {
      dailyWageCentavos: toCentavos(employee.daily_wage),
      foodAllowancePerDayCentavos: toCentavos(employee.food_allowance_per_day),
      sleepAllowancePerDayCentavos: toCentavos(employee.sleep_allowance_per_day),
      overtimeFeeCentavos: toCentavos(employee.overtime_fee),
    },
    {
      daysWorked: input.days_worked,
      daysOnLeave: input.days_on_leave,
      overtimeDays: input.overtime_days,
      sleepDays: input.sleep_days,
      sssLoanPaymentCentavos: toCentavos(sssLoanPay),
      pagibigLoanPaymentCentavos: toCentavos(pagibigLoanPay),
      advancePaymentsCentavos: allocations.map((a) => toCentavos(a.amount)),
    }
  );

  const row: EntryRow = {
    days_worked: input.days_worked,
    days_on_leave: input.days_on_leave,
    overtime_days: input.overtime_days,
    sleep_days: input.sleep_days,
    daily_wage: employee.daily_wage,
    overtime_fee: employee.overtime_fee,
    food_allowance_per_day: employee.food_allowance_per_day,
    sleep_allowance_per_day: employee.sleep_allowance_per_day,
    total_food_allowance: fromCentavos(result.totalFoodAllowanceCentavos),
    total_sleep_allowance: fromCentavos(result.totalSleepAllowanceCentavos),
    weekly_salary: fromCentavos(result.weeklySalaryCentavos),
    overtime_amount: fromCentavos(result.overtimeAmountCentavos),
    gross_weekly_salary: fromCentavos(result.grossWeeklySalaryCentavos),
    sss_contribution: 0,
    pagibig_contribution: 0,
    philhealth_contribution: 0,
    sss_loan_payment: sssLoanPay,
    pagibig_loan_payment: pagibigLoanPay,
    total_advance_deduction: fromCentavos(result.totalAdvanceDeductionCentavos),
    total_deductions: fromCentavos(result.totalDeductionsCentavos),
    net_weekly_pay: fromCentavos(result.netWeeklyPayCentavos),
    advance_allocations: allocations,
  };

  return { row, result };
}
