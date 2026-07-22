import { z } from "zod";

export const periodSchema = z
  .object({
    period_start: z.string().min(1, "Start date is required"),
    period_end: z.string().min(1, "End date is required"),
    note: z.string().max(200),
  })
  .refine((d) => d.period_end >= d.period_start, {
    message: "End date must be on or after the start date",
    path: ["period_end"],
  });
export type PeriodInput = z.infer<typeof periodSchema>;

const money = z
  .number({ message: "Enter a valid amount" })
  .min(0, "Must be zero or more")
  .max(9_999_999, "Too large");
const days = z
  .number({ message: "Enter a number of days" })
  .min(0, "Must be zero or more")
  .max(31, "Too many days");

export const advanceAllocationSchema = z.object({
  advance_id: z.string().uuid(),
  amount: money,
});

export const payrollEntrySchema = z.object({
  days_worked: days,
  days_on_leave: days,
  overtime_days: days,
  sleep_days: days,
  sss_loan_payment: money,
  pagibig_loan_payment: money,
  advance_allocations: z.array(advanceAllocationSchema),
});
export type PayrollEntryInput = z.infer<typeof payrollEntrySchema>;
