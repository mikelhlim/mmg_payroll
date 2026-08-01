"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAuthenticated } from "@/lib/auth-role";
import { logTransaction } from "@/lib/transaction-log";
import {
  expenseReportSchema,
  expenseItemsPayloadSchema,
  payrollLinkSchema,
  type ExpenseReportInput,
  type ExpenseItemsPayload,
  type PayrollLinkInput,
} from "@/lib/validation/expenses";
import { formatPeriod } from "@/lib/payroll/period";
import { analyzeNewPeriod } from "@/lib/payroll/validation";
import { carryForwardDescriptions, isBlankItem, type ExpenseLineInput } from "@/lib/expenses/totals";
import type { ExpenseCategory, ExpenseItem } from "@/lib/types";

export type CreateExpenseReportResult =
  | { error: string }
  | { warning: string }
  | { ok: true; id: string };

export async function createExpenseReport(
  raw: ExpenseReportInput,
  confirm = false
): Promise<CreateExpenseReportResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = expenseReportSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  // Overlap / skipped-days check against other expense reports — same
  // pattern as payroll's createPeriod, now that a report's dates are entered
  // directly rather than derived from a linked payroll run.
  if (!confirm) {
    const { data: existing } = await supabase
      .from("expense_periods")
      .select("period_start, period_end");
    const analysis = analyzeNewPeriod(existing ?? [], v);
    if (analysis.overlap) {
      return {
        warning: `This period overlaps an existing expense report (${formatPeriod(
          analysis.overlap.period_start,
          analysis.overlap.period_end
        )}). Proceed anyway?`,
      };
    }
    if (analysis.gapDays > 0) {
      return {
        warning: `There ${analysis.gapDays === 1 ? "is" : "are"} ${analysis.gapDays} skipped day${
          analysis.gapDays === 1 ? "" : "s"
        } between the previous report (${formatPeriod(
          analysis.precededBy!.period_start,
          analysis.precededBy!.period_end
        )}) and this one. Proceed anyway?`,
      };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("expense_periods")
    .insert({
      period_start: v.period_start,
      period_end: v.period_end,
      note: v.note.trim() || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "An expense report for these exact dates already exists." };
    }
    return { error: error.message };
  }

  // Seed line items: carry forward the nearest earlier report's non-blank
  // descriptions per category (falling back to the category's own seeded
  // defaults when there's no earlier report to draw from). Blank rows are
  // never persisted — the editor re-pads each category up to MIN_ROWS
  // visible rows on load instead.
  const [{ data: categoryRows }, { data: priorReport }] = await Promise.all([
    supabase.from("expense_categories").select("*").eq("is_active", true).order("sort_order"),
    supabase
      .from("expense_periods")
      .select("id")
      .lt("period_start", v.period_start)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const categories = (categoryRows ?? []) as ExpenseCategory[];

  let priorItems: ExpenseItem[] = [];
  if (priorReport) {
    const { data: priorItemRows } = await supabase
      .from("expense_items")
      .select("*")
      .eq("expense_period_id", priorReport.id)
      .order("sort_order", { ascending: true });
    priorItems = (priorItemRows ?? []) as ExpenseItem[];
  }
  const priorByCategory = new Map<string, ExpenseItem[]>();
  for (const item of priorItems) {
    const bucket = priorByCategory.get(item.category_id);
    if (bucket) bucket.push(item);
    else priorByCategory.set(item.category_id, [item]);
  }

  const seedRows = categories.flatMap((category) => {
    const previous: ExpenseLineInput[] = (priorByCategory.get(category.id) ?? []).map((i) => ({
      item_date: i.item_date,
      description: i.description,
      amount: i.amount,
    }));
    const nonBlankLines = carryForwardDescriptions(previous, category).filter((l) => !isBlankItem(l));
    return nonBlankLines.map((line, idx) => ({
      expense_period_id: data.id,
      category_id: category.id,
      item_date: line.item_date,
      description: line.description?.trim() || null,
      amount: line.amount,
      sort_order: idx,
    }));
  });

  if (seedRows.length > 0) {
    const { error: seedError } = await supabase.from("expense_items").insert(seedRows);
    if (seedError) return { error: seedError.message };
  }

  await logTransaction(supabase, {
    action: "create",
    entity: "expense_period",
    entity_id: data.id,
    summary: `Created expense report ${formatPeriod(v.period_start, v.period_end)}`,
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  revalidatePath("/");
  return { ok: true, id: data.id };
}

export type SaveExpenseReportResult = { error: string } | { ok: true };

export async function saveExpenseReport(
  id: string,
  rawItems: ExpenseItemsPayload
): Promise<SaveExpenseReportResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = expenseItemsPayloadSchema.safeParse(rawItems);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { data: period } = await supabase
    .from("expense_periods")
    .select("status, period_start, period_end")
    .eq("id", id)
    .maybeSingle();
  if (!period) return { error: "Expense report not found." };
  if (period.status === "finalized") {
    return { error: "This expense report is already finalized and can't be changed." };
  }

  // Blank rows (no description, no date, ₱0) are never persisted — the
  // editor re-pads each category back to MIN_ROWS visible rows on load.
  const sortCounters = new Map<string, number>();
  const itemsToSave = parsed.data
    .filter((item) => !isBlankItem(item))
    .map((item) => {
      const next = sortCounters.get(item.category_id) ?? 0;
      sortCounters.set(item.category_id, next + 1);
      return {
        category_id: item.category_id,
        item_date: item.item_date,
        description: item.description.trim() || null,
        amount: item.amount,
        sort_order: next,
      };
    });

  const { error } = await supabase.rpc("save_expense_items", {
    p_expense_period_id: id,
    p_items: itemsToSave,
  });
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "update",
    entity: "expense_period",
    entity_id: id,
    summary: `Updated expense report ${formatPeriod(period.period_start, period.period_end)}`,
  });

  revalidatePath(`/expenses/${id}`);
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

export type UpdateExpensePayrollLinkResult = { error: string } | { ok: true };

/**
 * Attach (or clear) the payroll total: link a finalized payroll run — whose
 * net-pay total is read live from then on, even after this report is
 * finalized — or type a manual amount for a week with no matching run in the
 * system. The two are mutually exclusive; whichever field is provided wins
 * and the other is cleared, regardless of what the client sent for it.
 */
export async function updateExpensePayrollLink(
  id: string,
  raw: PayrollLinkInput
): Promise<UpdateExpensePayrollLinkResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = payrollLinkSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { data: period } = await supabase
    .from("expense_periods")
    .select("status, period_start, period_end")
    .eq("id", id)
    .maybeSingle();
  if (!period) return { error: "Expense report not found." };
  if (period.status === "finalized") {
    return { error: "This expense report is already finalized and can't be changed." };
  }

  let payrollPeriodId: string | null = null;
  let payrollTotalOverride: number | null = null;

  if (v.payroll_period_id) {
    const { data: run } = await supabase
      .from("payroll_periods")
      .select("status")
      .eq("id", v.payroll_period_id)
      .maybeSingle();
    if (!run) return { error: "Payroll run not found." };
    if (run.status !== "finalized") {
      return { error: "Only a finalized payroll run can be linked." };
    }
    payrollPeriodId = v.payroll_period_id;
  } else if (v.payroll_total_override !== null) {
    payrollTotalOverride = v.payroll_total_override;
  }

  const { error } = await supabase
    .from("expense_periods")
    .update({ payroll_period_id: payrollPeriodId, payroll_total_override: payrollTotalOverride })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { error: "That payroll run is already linked to another expense report." };
    }
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "update",
    entity: "expense_period",
    entity_id: id,
    summary: `Updated payroll total for expense report ${formatPeriod(period.period_start, period.period_end)}`,
  });

  revalidatePath(`/expenses/${id}`);
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

export type FinalizeExpenseResult = { error: string } | { ok: true };

export async function finalizeExpenseReport(id: string): Promise<FinalizeExpenseResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { data: period } = await supabase
    .from("expense_periods")
    .select("status, period_start, period_end, payroll_period_id, payroll_total_override")
    .eq("id", id)
    .maybeSingle();
  if (!period) return { error: "Expense report not found." };
  if (period.status === "finalized") return { error: "This expense report is already finalized." };
  if (!period.payroll_period_id && period.payroll_total_override === null) {
    return {
      error:
        "Set a payroll total first — link a finalized payroll run or enter an amount — before finalizing.",
    };
  }

  const { error } = await supabase
    .from("expense_periods")
    .update({ status: "finalized", finalized_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "finalize",
    entity: "expense_period",
    entity_id: id,
    summary: `Finalized expense report ${formatPeriod(period.period_start, period.period_end)}`,
  });

  revalidatePath(`/expenses/${id}`);
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

export async function reopenExpenseReport(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { data: period } = await supabase
    .from("expense_periods")
    .select("status, period_start, period_end, version")
    .eq("id", id)
    .maybeSingle();
  if (!period) return { error: "Expense report not found." };
  if (period.status !== "finalized") return { error: "This expense report isn't finalized." };

  const { error } = await supabase
    .from("expense_periods")
    .update({
      status: "draft",
      version: (period.version ?? 1) + 1,
      amended_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "amend",
    entity: "expense_period",
    entity_id: id,
    summary: `Reopened expense report ${formatPeriod(period.period_start, period.period_end)} for amendment`,
  });

  revalidatePath(`/expenses/${id}`);
  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

export async function deleteExpenseReport(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { data: period } = await supabase
    .from("expense_periods")
    .select("status, period_start, period_end")
    .eq("id", id)
    .maybeSingle();
  if (!period) return { error: "Expense report not found." };
  if (period.status === "finalized") {
    return { error: "Finalized expense reports can't be deleted." };
  }

  const { error } = await supabase.from("expense_periods").delete().eq("id", id);
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "delete",
    entity: "expense_period",
    entity_id: id,
    summary: `Deleted draft expense report ${formatPeriod(period.period_start, period.period_end)}`,
  });

  revalidatePath("/expenses");
  revalidatePath("/reports");
  revalidatePath("/");
  return { ok: true };
}
