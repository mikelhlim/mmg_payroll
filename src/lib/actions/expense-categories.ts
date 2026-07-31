"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth-role";
import { logTransaction } from "@/lib/transaction-log";
import { expenseCategorySchema, type ExpenseCategoryInput } from "@/lib/validation/expenses";

type Result = { error: string } | { warning: string } | { ok: true };

function afterMutationRevalidate() {
  revalidatePath("/admin/expense-types");
  revalidatePath("/expenses");
}

function cleanDescriptions(descriptions: string[]): string[] {
  return descriptions.map((d) => d.trim()).filter(Boolean);
}

export async function createExpenseCategory(raw: ExpenseCategoryInput): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);
  const parsed = expenseCategorySchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const name = parsed.data.name.trim();
  const default_descriptions = cleanDescriptions(parsed.data.default_descriptions);

  const { data: maxRow } = await supabase
    .from("expense_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("expense_categories")
    .insert({ name, sort_order: nextOrder, default_descriptions })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "An expense type with this name already exists." };
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "create",
    entity: "expense_category",
    entity_id: data.id,
    summary: `Added expense type "${name}"`,
  });
  afterMutationRevalidate();
  return { ok: true };
}

export async function updateExpenseCategory(id: string, raw: ExpenseCategoryInput): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);
  const parsed = expenseCategorySchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const name = parsed.data.name.trim();
  const default_descriptions = cleanDescriptions(parsed.data.default_descriptions);

  const { error } = await supabase
    .from("expense_categories")
    .update({ name, default_descriptions })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "An expense type with this name already exists." };
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "update",
    entity: "expense_category",
    entity_id: id,
    summary: `Updated expense type "${name}"`,
  });
  afterMutationRevalidate();
  return { ok: true };
}

export async function reorderExpenseCategory(id: string, direction: "up" | "down"): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);

  const { data: rows } = await supabase
    .from("expense_categories")
    .select("id, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const list = rows ?? [];
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return { error: "Expense type not found." };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true }; // already at the edge

  const a = list[idx];
  const b = list[swapIdx];
  const { error: e1 } = await supabase
    .from("expense_categories")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase
    .from("expense_categories")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);
  if (e2) return { error: e2.message };

  afterMutationRevalidate();
  return { ok: true };
}

export async function deleteExpenseCategory(id: string, confirm = false): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);

  const { data: existing } = await supabase
    .from("expense_categories")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const name = existing?.name ?? "this expense type";

  const { count } = await supabase
    .from("expense_items")
    .select("*", { count: "exact", head: true })
    .eq("category_id", id);

  // category_id is `on delete restrict` — past items are financial records,
  // so a type that's ever been used is archived (hidden from new reports,
  // still shown on the reports that already reference it) instead of deleted.
  if ((count ?? 0) > 0) {
    if (!confirm) {
      return {
        warning: `${count} expense item${count === 1 ? "" : "s"} on past reports use "${name}". It can't be deleted, but it can be archived — new expense reports won't show it, but past reports will. Archive it?`,
      };
    }
    const { error } = await supabase
      .from("expense_categories")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return { error: error.message };

    await logTransaction(supabase, {
      action: "update",
      entity: "expense_category",
      entity_id: id,
      summary: `Archived expense type "${name}" (has items on past reports)`,
    });
    afterMutationRevalidate();
    return { ok: true };
  }

  const { error } = await supabase.from("expense_categories").delete().eq("id", id);
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "delete",
    entity: "expense_category",
    entity_id: id,
    summary: `Deleted expense type "${name}"`,
  });
  afterMutationRevalidate();
  return { ok: true };
}
