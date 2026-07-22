import { describe, expect, it } from "vitest";
import { buildEntryRow } from "./build-entry";
import type { Advance, Employee, Loan } from "@/lib/types";
import type { PayrollEntryInput } from "@/lib/validation/payroll";

const employee: Employee = {
  id: "emp-1",
  first_name: "Juan",
  last_name: "Dela Cruz",
  middle_name: null,
  nickname: null,
  birthdate: null,
  employment_date: null,
  sss_number: null,
  philhealth_number: null,
  pagibig_number: null,
  daily_wage: 600,
  overtime_fee: 175,
  food_allowance_per_day: 150,
  sleep_allowance_per_day: 100,
  sss_contribution: 0,
  pagibig_contribution: 0,
  philhealth_contribution: 0,
  is_active: true,
  created_by: null,
  created_at: "",
  updated_at: "",
};

const baseInput: PayrollEntryInput = {
  days_worked: 6,
  days_on_leave: 0,
  overtime_days: 0,
  sleep_days: 6,
  sss_loan_payment: 0,
  pagibig_loan_payment: 0,
  advance_allocations: [],
};

function loan(overrides: Partial<Loan>): Loan {
  return {
    id: "loan-1",
    employee_id: employee.id,
    loan_type: "SSS",
    principal: 1000,
    current_balance: 1000,
    start_date: null,
    created_at: "",
    ...overrides,
  };
}

function advance(overrides: Partial<Advance>): Advance {
  return {
    id: "adv-1",
    employee_id: employee.id,
    label: "Advance",
    start_date: null,
    total_advance: 1000,
    current_balance: 1000,
    is_active: true,
    created_at: "",
    ...overrides,
  };
}

describe("buildEntryRow — loan payment caps", () => {
  it("caps a loan repayment at the remaining balance", () => {
    const { row } = buildEntryRow(
      employee,
      [loan({ principal: 1000, current_balance: 300 })],
      [],
      { ...baseInput, sss_loan_payment: 500 }
    );
    expect(row.sss_loan_payment).toBe(300);
  });

  it("caps a loan repayment at the original principal, even if balance is (wrongly) higher", () => {
    const { row } = buildEntryRow(
      employee,
      [loan({ principal: 400, current_balance: 900 })],
      [],
      { ...baseInput, sss_loan_payment: 700 }
    );
    expect(row.sss_loan_payment).toBe(400);
  });

  it("passes through a payment within both caps unchanged", () => {
    const { row } = buildEntryRow(
      employee,
      [loan({ loan_type: "PAGIBIG", principal: 1000, current_balance: 600 })],
      [],
      { ...baseInput, pagibig_loan_payment: 250 }
    );
    expect(row.pagibig_loan_payment).toBe(250);
  });

  it("pays nothing toward a loan type the employee doesn't have", () => {
    const { row } = buildEntryRow(employee, [], [], { ...baseInput, sss_loan_payment: 500 });
    expect(row.sss_loan_payment).toBe(0);
  });
});

describe("buildEntryRow — advance allocation caps", () => {
  it("caps an advance deduction at its remaining balance", () => {
    const adv = advance({ id: "adv-1", current_balance: 150 });
    const { row } = buildEntryRow(employee, [], [adv], {
      ...baseInput,
      advance_allocations: [{ advance_id: "adv-1", amount: 500 }],
    });
    expect(row.total_advance_deduction).toBe(150);
  });

  it("drops an allocation referencing an advance that no longer exists", () => {
    const { row } = buildEntryRow(employee, [], [], {
      ...baseInput,
      advance_allocations: [{ advance_id: "missing", amount: 500 }],
    });
    expect(row.total_advance_deduction).toBe(0);
    expect(row.advance_allocations).toEqual([]);
  });
});
