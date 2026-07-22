"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAuthenticated } from "@/lib/auth-role";
import { logTransaction } from "@/lib/transaction-log";
import { employeeSchema, type EmployeeInput } from "@/lib/validation/employee";

export type EmployeeActionResult = { error: string } | { ok: true; id: string };

// numeric(12,2) — normalize to 2 decimals before persisting.
const round2 = (n: number) => Math.round(n * 100) / 100;

const nullify = (v: string) => (v.trim() ? v.trim() : null);

function toRow(input: EmployeeInput) {
  return {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    middle_name: nullify(input.middle_name),
    nickname: nullify(input.nickname),
    birthdate: nullify(input.birthdate),
    employment_date: nullify(input.employment_date),
    sss_number: nullify(input.sss_number),
    philhealth_number: nullify(input.philhealth_number),
    pagibig_number: nullify(input.pagibig_number),
    daily_wage: round2(input.daily_wage),
    overtime_fee: round2(input.overtime_fee),
    food_allowance_per_day: round2(input.food_allowance_per_day),
    sleep_allowance_per_day: round2(input.sleep_allowance_per_day),
    // Statutory contributions are no longer collected — omit them so the
    // column keeps its DB default (insert) or existing value (update).
    is_active: input.is_active,
  };
}

export async function createEmployee(raw: EmployeeInput): Promise<EmployeeActionResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("employees")
    .insert({ ...toRow(parsed.data), created_by: user?.id ?? null })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "create",
    entity: "employee",
    entity_id: data.id,
    summary: `Added employee ${parsed.data.last_name}, ${parsed.data.first_name}`,
  });

  revalidatePath("/employees");
  revalidatePath("/");
  return { ok: true, id: data.id };
}

export async function updateEmployee(
  id: string,
  raw: EmployeeInput
): Promise<EmployeeActionResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { error } = await supabase.from("employees").update(toRow(parsed.data)).eq("id", id);
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "update",
    entity: "employee",
    entity_id: id,
    summary: `Updated employee ${parsed.data.last_name}, ${parsed.data.first_name}`,
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  revalidatePath("/");
  return { ok: true, id };
}

export async function deleteEmployee(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { data: existing } = await supabase
    .from("employees")
    .select("first_name, last_name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) {
    // ON DELETE RESTRICT from payroll_entries → employee has payroll history.
    if (error.code === "23503") {
      return {
        error:
          "This employee has saved payroll records and can't be deleted. Mark them inactive instead.",
      };
    }
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "delete",
    entity: "employee",
    entity_id: id,
    summary: existing
      ? `Deleted employee ${existing.last_name}, ${existing.first_name}`
      : "Deleted employee",
  });

  revalidatePath("/employees");
  revalidatePath("/");
  return { ok: true };
}
