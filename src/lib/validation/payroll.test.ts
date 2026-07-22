import { describe, expect, it } from "vitest";
import { payrollEntrySchema } from "./payroll";

const base = {
  days_worked: 5,
  days_on_leave: 0,
  overtime_days: 0,
  sleep_days: 0,
  sss_loan_payment: 0,
  pagibig_loan_payment: 0,
  advance_allocations: [],
};

describe("payrollEntrySchema", () => {
  it("accepts sleep_days and overtime_days up to days_worked", () => {
    expect(
      payrollEntrySchema.safeParse({ ...base, sleep_days: 5, overtime_days: 5 }).success
    ).toBe(true);
  });

  it("rejects sleep_days greater than days_worked", () => {
    const r = payrollEntrySchema.safeParse({ ...base, sleep_days: 6 });
    expect(r.success).toBe(false);
  });

  it("rejects overtime_days greater than days_worked", () => {
    const r = payrollEntrySchema.safeParse({ ...base, overtime_days: 6 });
    expect(r.success).toBe(false);
  });
});
