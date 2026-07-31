"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth-role";
import { logTransaction } from "@/lib/transaction-log";
import { departmentSchema, type DepartmentInput } from "@/lib/validation/departments";

type Result = { error: string } | { warning: string } | { ok: true };

function afterMutationRevalidate() {
  revalidatePath("/admin/departments");
  revalidatePath("/employees");
  revalidatePath("/payroll", "layout");
}

export async function createDepartment(raw: DepartmentInput): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);
  const parsed = departmentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const name = parsed.data.name.trim();

  const { data: maxRow } = await supabase
    .from("departments")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("departments")
    .insert({ name, sort_order: nextOrder })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "A department with this name already exists." };
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "create",
    entity: "department",
    entity_id: data.id,
    summary: `Added department "${name}"`,
  });
  afterMutationRevalidate();
  return { ok: true };
}

export async function updateDepartment(id: string, raw: DepartmentInput): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);
  const parsed = departmentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const name = parsed.data.name.trim();

  const { error } = await supabase.from("departments").update({ name }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "A department with this name already exists." };
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "update",
    entity: "department",
    entity_id: id,
    summary: `Renamed department to "${name}"`,
  });
  afterMutationRevalidate();
  return { ok: true };
}

export async function reorderDepartment(id: string, direction: "up" | "down"): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);

  const { data: rows } = await supabase
    .from("departments")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const list = rows ?? [];
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return { error: "Department not found." };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true }; // already at the edge

  const a = list[idx];
  const b = list[swapIdx];
  const { error: e1 } = await supabase
    .from("departments")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase
    .from("departments")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);
  if (e2) return { error: e2.message };

  afterMutationRevalidate();
  return { ok: true };
}

export async function deleteDepartment(id: string, confirm = false): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);

  if (!confirm) {
    const { count } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("department_id", id);
    if ((count ?? 0) > 0) {
      return {
        warning: `${count} employee${count === 1 ? "" : "s"} ${
          count === 1 ? "is" : "are"
        } assigned to this department. Deleting it will leave them with no department. Proceed?`,
      };
    }
  }

  const { data: existing } = await supabase
    .from("departments")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "delete",
    entity: "department",
    entity_id: id,
    summary: existing ? `Deleted department "${existing.name}"` : "Deleted department",
  });
  afterMutationRevalidate();
  return { ok: true };
}
