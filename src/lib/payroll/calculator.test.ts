import { describe, expect, it } from "vitest";
import { computePayroll, type PayrollInputs, type PayrollRates } from "./calculator";
import { toCentavos } from "@/lib/money";

// A realistic-ish PH daily-wage employee.
const rates: PayrollRates = {
  dailyWageCentavos: toCentavos(610), // ₱610/day
  foodAllowancePerDayCentavos: toCentavos(80), // ₱80/day
  sleepAllowancePerDayCentavos: toCentavos(50), // ₱50/day
  overtimeFeeCentavos: toCentavos(150), // ₱150/OT day
};

const noDeductions: Omit<PayrollInputs, "daysWorked" | "daysOnLeave" | "overtimeDays"> = {
  sssContributionCentavos: 0,
  pagibigContributionCentavos: 0,
  philhealthContributionCentavos: 0,
  sssLoanPaymentCentavos: 0,
  pagibigLoanPaymentCentavos: 0,
  advancePaymentsCentavos: [],
};

describe("computePayroll — earnings", () => {
  it("computes allowances and weekly salary from days worked", () => {
    const r = computePayroll(rates, {
      daysWorked: 6,
      daysOnLeave: 0,
      overtimeDays: 0,
      ...noDeductions,
    });
    expect(r.totalFoodAllowanceCentavos).toBe(toCentavos(480)); // 6 × 80
    expect(r.totalSleepAllowanceCentavos).toBe(toCentavos(300)); // 6 × 50
    expect(r.baseWageCentavos).toBe(toCentavos(3660)); // 6 × 610
    expect(r.weeklySalaryCentavos).toBe(toCentavos(4440)); // 3660 + 480 + 300
    expect(r.overtimeAmountCentavos).toBe(0);
    expect(r.grossWeeklySalaryCentavos).toBe(toCentavos(4440));
    expect(r.netWeeklyPayCentavos).toBe(toCentavos(4440));
    expect(r.isNetNonPositive).toBe(false);
  });

  it("adds overtime as overtime_days × fixed daily overtime fee", () => {
    const r = computePayroll(rates, {
      daysWorked: 6,
      daysOnLeave: 0,
      overtimeDays: 2,
      ...noDeductions,
    });
    expect(r.overtimeAmountCentavos).toBe(toCentavos(300)); // 2 × 150
    // Food is paid on regular days only: (6 − 2) × 80 = 320.
    expect(r.totalFoodAllowanceCentavos).toBe(toCentavos(320));
    // base 3660 + food 320 + sleep 300 = 4280; + OT 300 = 4580.
    expect(r.grossWeeklySalaryCentavos).toBe(toCentavos(4580));
  });

  it("pays food allowance only on non-overtime days (worked − overtime)", () => {
    const r = computePayroll(rates, {
      daysWorked: 5,
      daysOnLeave: 0,
      overtimeDays: 2,
      ...noDeductions,
    });
    expect(r.totalFoodAllowanceCentavos).toBe(toCentavos(240)); // (5 − 2) × 80
    expect(r.totalSleepAllowanceCentavos).toBe(toCentavos(250)); // sleep unaffected: 5 × 50
  });

  it("does not pay leave days — only days worked are paid", () => {
    const worked = computePayroll(rates, {
      daysWorked: 4,
      daysOnLeave: 2,
      overtimeDays: 0,
      ...noDeductions,
    });
    expect(worked.baseWageCentavos).toBe(toCentavos(2440)); // 4 × 610, leave ignored
    expect(worked.weeklySalaryCentavos).toBe(toCentavos(2960)); // 2440 + 320 + 200
  });

  it("supports fractional (half) days without float drift", () => {
    const r = computePayroll(rates, {
      daysWorked: 5.5,
      daysOnLeave: 0,
      overtimeDays: 0,
      ...noDeductions,
    });
    expect(r.baseWageCentavos).toBe(toCentavos(3355)); // 5.5 × 610
    expect(r.totalFoodAllowanceCentavos).toBe(toCentavos(440)); // 5.5 × 80
  });
});

describe("computePayroll — deductions & net", () => {
  it("subtracts contributions, loans, and advances", () => {
    const r = computePayroll(rates, {
      daysWorked: 6,
      daysOnLeave: 0,
      overtimeDays: 1,
      sssContributionCentavos: toCentavos(135),
      pagibigContributionCentavos: toCentavos(100),
      philhealthContributionCentavos: toCentavos(90),
      sssLoanPaymentCentavos: toCentavos(200),
      pagibigLoanPaymentCentavos: toCentavos(150),
      advancePaymentsCentavos: [toCentavos(250), toCentavos(100)],
    });
    // food = (6 − 1) × 80 = 400; base 3660 + 400 + sleep 300 = 4360; + OT 150 = 4510.
    expect(r.grossWeeklySalaryCentavos).toBe(toCentavos(4510));
    expect(r.totalContributionsCentavos).toBe(toCentavos(325)); // 135+100+90
    expect(r.totalLoanPaymentsCentavos).toBe(toCentavos(350)); // 200+150
    expect(r.totalAdvanceDeductionCentavos).toBe(toCentavos(350)); // 250+100
    expect(r.totalDeductionsCentavos).toBe(toCentavos(1025));
    expect(r.netWeeklyPayCentavos).toBe(toCentavos(3485)); // 4510 - 1025
    expect(r.isNetNonPositive).toBe(false);
  });

  it("flags net ≤ 0 so the UI can alert and block finalize", () => {
    const r = computePayroll(rates, {
      daysWorked: 1,
      daysOnLeave: 0,
      overtimeDays: 0,
      ...noDeductions,
      sssLoanPaymentCentavos: toCentavos(5000), // wipes out the small week
    });
    expect(r.netWeeklyPayCentavos).toBeLessThanOrEqual(0);
    expect(r.isNetNonPositive).toBe(true);
  });

  it("treats exactly-zero net as non-positive (alert)", () => {
    const r = computePayroll(rates, {
      daysWorked: 1,
      daysOnLeave: 0,
      overtimeDays: 0,
      ...noDeductions,
      // gross for 1 day = 610 + 80 + 50 = 740
      sssContributionCentavos: toCentavos(740),
    });
    expect(r.netWeeklyPayCentavos).toBe(0);
    expect(r.isNetNonPositive).toBe(true);
  });

  it("never lets negative inputs increase pay", () => {
    const r = computePayroll(rates, {
      daysWorked: -3,
      daysOnLeave: 0,
      overtimeDays: -1,
      ...noDeductions,
      sssContributionCentavos: -100,
    });
    expect(r.baseWageCentavos).toBe(0);
    expect(r.overtimeAmountCentavos).toBe(0);
    expect(r.totalContributionsCentavos).toBe(0);
    expect(r.netWeeklyPayCentavos).toBe(0);
  });
});
