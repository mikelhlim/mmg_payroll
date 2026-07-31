import { z } from "zod";

export const expenseReportSchema = z.object({
  payroll_period_id: z.string().uuid("Select a payroll run"),
  note: z.string().max(200),
});
export type ExpenseReportInput = z.infer<typeof expenseReportSchema>;

const money = z
  .number({ message: "Enter a valid amount" })
  .min(0, "Must be zero or more")
  .max(9_999_999, "Too large");

export const expenseItemSchema = z.object({
  category_id: z.string().uuid(),
  item_date: z.string().nullable(),
  description: z.string().max(200),
  amount: money,
});
export type ExpenseItemInput = z.infer<typeof expenseItemSchema>;

export const expenseItemsPayloadSchema = z.array(expenseItemSchema);
export type ExpenseItemsPayload = z.infer<typeof expenseItemsPayloadSchema>;

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  default_descriptions: z.array(z.string().trim().max(200)),
});
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

export const expenseCategoryDefaults: ExpenseCategoryInput = {
  name: "",
  default_descriptions: [],
};
