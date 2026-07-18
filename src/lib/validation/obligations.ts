import { z } from "zod";

const money = z
  .number({ message: "Enter a valid amount" })
  .min(0, "Must be zero or more")
  .max(9_999_999, "Too large");

export const loanSchema = z.object({
  loan_type: z.enum(["SSS", "PAGIBIG"]),
  principal: money,
  current_balance: money,
  start_date: z.string(),
});
export type LoanInput = z.infer<typeof loanSchema>;

export const advanceSchema = z.object({
  label: z.string().trim().max(120),
  start_date: z.string(),
  total_advance: money,
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
