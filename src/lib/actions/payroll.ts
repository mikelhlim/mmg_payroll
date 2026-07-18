"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAuthenticated } from "@/lib/auth-role";
import {
  periodSchema,
  payrollEntrySchema,
  type PeriodInput,
  type PayrollEntryInput,
} from "@/lib/validation/payroll";
import { buildEntryRow } from "@/lib/payroll/build-entry";
import type { Advance, Employee, Loan } from "@/lib/types";

export async function createPeriod(
  raw: PeriodInput
): Promise<{ error: string } | { ok: true; id: string }> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = periodSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("payroll_periods")
    .insert({
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      note: parsed.data.note.trim() || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A payroll period with these exact dates already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/payroll");
  revalidatePath("/");
  return { ok: true, id: data.id };
}

export async function deletePeriod(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (period?.status === "finalized") {
    return { error: "Finalized payroll periods can't be deleted." };
  }

  const { error } = await supabase.from("payroll_periods").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/payroll");
  revalidatePath("/");
  return { ok: true };
}

export type SaveEntryResult =
  | { error: string }
  | { ok: true; netWeeklyPay: number; isNetNonPositive: boolean };

export async function savePayrollEntry(
  periodId: string,
  employeeId: string,
  raw: PayrollEntryInput
): Promise<SaveEntryResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = payrollEntrySchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("status")
    .eq("id", periodId)
    .maybeSingle();
  if (!period) return { error: "Payroll period not found." };
  if (period.status === "finalized") {
    return { error: "This payroll period is already finalized and can't be changed." };
  }

  const [{ data: employee }, { data: loanRows }, { data: advanceRows }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", employeeId).maybeSingle(),
    supabase.from("loans").select("*").eq("employee_id", employeeId),
    supabase.from("advances").select("*").eq("employee_id", employeeId).eq("is_active", true),
  ]);
  if (!employee) return { error: "Employee not found." };

  const { row, result } = buildEntryRow(
    employee as Employee,
    (loanRows ?? []) as Loan[],
    (advanceRows ?? []) as Advance[],
    parsed.data
  );

  const { error } = await supabase
    .from("payroll_entries")
    .upsert(
      { period_id: periodId, employee_id: employeeId, ...row },
      { onConflict: "period_id,employee_id" }
    );
  if (error) return { error: error.message };

  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/");
  return {
    ok: true,
    netWeeklyPay: row.net_weekly_pay,
    isNetNonPositive: result.isNetNonPositive,
  };
}

export async function finalizePeriod(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { error } = await supabase.rpc("finalize_payroll_period", { p_period_id: id });
  if (error) return { error: error.message };

  revalidatePath(`/payroll/${id}`);
  revalidatePath("/payroll");
  revalidatePath("/employees");
  revalidatePath("/");
  return { ok: true };
}
