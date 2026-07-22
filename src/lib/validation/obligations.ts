import { z } from "zod";

const money = z
  .number({ message: "Enter a valid amount" })
  .min(0, "Must be zero or more")
  .max(9_999_999, "Too large");
// The original amount of a loan/advance must be a real, positive amount —
// only current_balance may legitimately be 0 (fully paid off).
const moneyPositive = money.min(0.01, "Must be greater than zero");

export const loanSchema = z.object({
  loan_type: z.enum(["SSS", "PAGIBIG"]),
  principal: moneyPositive,
  current_balance: money,
  start_date: z.string().min(1, "Start date is required"),
});
export type LoanInput = z.infer<typeof loanSchema>;

export const advanceSchema = z.object({
  label: z.string().trim().max(120),
  start_date: z.string().min(1, "Start date is required"),
  total_advance: moneyPositive,
  current_balance: money,
});
export type AdvanceInput = z.infer<typeof advanceSchema>;

export const advanceDefaults: AdvanceInput = {
  label: "",
  start_date: "",
  total_advance: 0,
  current_balance: 0,
};

export const MAX_ADVANCES = 5;
