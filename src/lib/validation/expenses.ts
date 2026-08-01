import { z } from "zod";

// A period is created on its own now — no payroll run required — so this
// mirrors payroll/validation.ts's periodSchema exactly (same Start/End/Note
// dialog shape, same end->=start rule).
export const expenseReportSchema = z
  .object({
    period_start: z.string().min(1, "Start date is required"),
    period_end: z.string().min(1, "End date is required"),
    note: z.string().max(200),
  })
  .refine((d) => d.period_end >= d.period_start, {
    message: "End date must be on or after the start date",
    path: ["period_end"],
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

// How a report's payroll total is attached: link a finalized run's live net
// total, or type a manual amount. The two are mutually exclusive — the
// server normalizes rather than rejects (setting one always clears the
// other), so this schema only validates each field's own shape.
export const payrollLinkSchema = z.object({
  payroll_period_id: z.string().uuid().nullable(),
  payroll_total_override: money.nullable(),
});
export type PayrollLinkInput = z.infer<typeof payrollLinkSchema>;

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  default_descriptions: z.array(z.string().trim().max(200)),
  per_item_pdf_pages: z.boolean(),
});
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

export const expenseCategoryDefaults: ExpenseCategoryInput = {
  name: "",
  default_descriptions: [],
  per_item_pdf_pages: false,
};
