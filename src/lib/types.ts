// Database row shapes (mirrors supabase/schema.sql). Money columns are
// numeric(12,2) and come back as JS numbers; use src/lib/money.ts to compute.

export type AppRole = "admin" | "staff";

export type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  nickname: string | null;
  birthdate: string | null; // yyyy-mm-dd
  employment_date: string | null; // yyyy-mm-dd
  sss_number: string | null;
  philhealth_number: string | null;
  pagibig_number: string | null;
  daily_wage: number;
  overtime_fee: number;
  food_allowance_per_day: number;
  sleep_allowance_per_day: number;
  sss_contribution: number;
  pagibig_contribution: number;
  philhealth_contribution: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Advance = {
  id: string;
  employee_id: string;
  label: string | null;
  start_date: string | null;
  total_advance: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
};

export type LoanType = "SSS" | "PAGIBIG";

export type Loan = {
  id: string;
  employee_id: string;
  loan_type: LoanType;
  principal: number;
  current_balance: number;
  start_date: string | null;
  created_at: string;
};

export type PayrollStatus = "draft" | "finalized";

export type PayrollPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  status: PayrollStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  finalized_at: string | null;
  version: number;
  amended_at: string | null;
};

export type AdvanceAllocation = { advance_id: string; amount: number };

export type PayrollEntry = {
  id: string;
  period_id: string;
  employee_id: string;
  days_worked: number;
  days_on_leave: number;
  overtime_days: number;
  daily_wage: number;
  overtime_fee: number;
  food_allowance_per_day: number;
  sleep_allowance_per_day: number;
  total_food_allowance: number;
  total_sleep_allowance: number;
  weekly_salary: number;
  overtime_amount: number;
  gross_weekly_salary: number;
  sss_contribution: number;
  pagibig_contribution: number;
  philhealth_contribution: number;
  sss_loan_payment: number;
  pagibig_loan_payment: number;
  total_advance_deduction: number;
  total_deductions: number;
  net_weekly_pay: number;
  advance_allocations: AdvanceAllocation[];
  created_at: string;
  updated_at: string;
};

/** Convenience: full name in "Last, First Middle" order used across reports. */
export function fullName(e: Pick<Employee, "first_name" | "last_name" | "middle_name">): string {
  const middle = e.middle_name ? ` ${e.middle_name}` : "";
  return `${e.last_name}, ${e.first_name}${middle}`;
}

/** Age in whole years from a yyyy-mm-dd birthdate, or null. */
export function ageFromBirthdate(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const dob = new Date(birthdate + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
