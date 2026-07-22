"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAuthenticated } from "@/lib/auth-role";
import { logTransaction } from "@/lib/transaction-log";
import { formatPHP } from "@/lib/money";
import { employeeSchema, type EmployeeInput } from "@/lib/validation/employee";

export type EmployeeActionResult =
  | { error: string }
  | { warning: string }
  | { ok: true; id: string };

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
  raw: EmployeeInput,
  confirm = false
): Promise<EmployeeActionResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Deactivating doesn't delete anything, but the employee then disappears
  // from active rosters (new payroll runs, the main list) — warn if they
  // still have money owed or an uncomputed entry sitting in a draft run.
  if (!parsed.data.is_active && !confirm) {
    const { data: current } = await supabase
      .from("employees")
      .select("is_active")
      .eq("id", id)
      .maybeSingle();
    if (current?.is_active) {
      const [{ data: loans }, { data: advances }, { data: entries }] = await Promise.all([
        supabase.from("loans").select("loan_type, current_balance").eq("employee_id", id),
        supabase
          .from("advances")
          .select("current_balance")
          .eq("employee_id", id)
          .eq("is_active", true),
        supabase
          .from("payroll_entries")
          .select("id, payroll_periods(status)")
          .eq("employee_id", id),
      ]);

      const parts: string[] = [];
      const outstandingLoans = (loans ?? []).filter((l) => l.current_balance > 0);
      if (outstandingLoans.length) {
        parts.push(
          outstandingLoans
            .map((l) => `an outstanding ${l.loan_type} loan (${formatPHP(l.current_balance)})`)
            .join(" and ")
        );
      }
      const outstandingAdvances = (advances ?? []).filter((a) => a.current_balance > 0);
      if (outstandingAdvances.length) {
        const total = outstandingAdvances.reduce((s, a) => s + a.current_balance, 0);
        parts.push(
          `${outstandingAdvances.length} active advance${outstandingAdvances.length === 1 ? "" : "s"} totaling ${formatPHP(total)}`
        );
      }
      type EntryWithPeriod = { payroll_periods: { status: string }[] | { status: string } | null };
      const draftEntryCount = (entries ?? []).filter((e) => {
        const p = (e as EntryWithPeriod).payroll_periods;
        const status = Array.isArray(p) ? p[0]?.status : p?.status;
        return status === "draft";
      }).length;
      if (draftEntryCount > 0) {
        parts.push(
          `${draftEntryCount} ${draftEntryCount === 1 ? "entry" : "entries"} in a draft payroll run`
        );
      }

      if (parts.length > 0) {
        return {
          warning: `This employee still has ${parts.join(", ")}. Deactivating won't delete these, but they'll disappear from active rosters. Proceed anyway?`,
        };
      }
    }
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
