"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAuthenticated } from "@/lib/auth-role";
import { logTransaction } from "@/lib/transaction-log";
import {
  periodSchema,
  payrollEntrySchema,
  type PeriodInput,
  type PayrollEntryInput,
} from "@/lib/validation/payroll";
import { analyzeNewPeriod } from "@/lib/payroll/validation";
import { formatPeriod } from "@/lib/payroll/period";
import { buildEntryRow } from "@/lib/payroll/build-entry";
import { formatPHP } from "@/lib/money";
import { fullName, type Advance, type Employee, type Loan } from "@/lib/types";

export type CreatePeriodResult =
  | { error: string }
  | { warning: string }
  | { ok: true; id: string };

export async function createPeriod(
  raw: PeriodInput,
  confirm = false
): Promise<CreatePeriodResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = periodSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  // Overlap / skipped-days check against existing periods.
  if (!confirm) {
    const { data: existing } = await supabase
      .from("payroll_periods")
      .select("period_start, period_end");
    const analysis = analyzeNewPeriod(existing ?? [], v);
    if (analysis.overlap) {
      return {
        warning: `This period overlaps an existing run (${formatPeriod(
          analysis.overlap.period_start,
          analysis.overlap.period_end
        )}). Proceed anyway?`,
      };
    }
    if (analysis.gapDays > 0) {
      return {
        warning: `There ${analysis.gapDays === 1 ? "is" : "are"} ${analysis.gapDays} skipped day${
          analysis.gapDays === 1 ? "" : "s"
        } between the previous run (${formatPeriod(
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
    .from("payroll_periods")
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
      return { error: "A payroll period with these exact dates already exists." };
    }
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "create",
    entity: "payroll_period",
    entity_id: data.id,
    summary: `Created payroll run ${formatPeriod(v.period_start, v.period_end)}`,
  });

  revalidatePath("/payroll");
  revalidatePath("/");
  return { ok: true, id: data.id };
}

export async function deletePeriod(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("status, period_start, period_end")
    .eq("id", id)
    .maybeSingle();
  if (!period) return { error: "Payroll period not found." };
  if (period.status === "finalized") {
    return { error: "Finalized payroll periods can't be deleted." };
  }

  const { error } = await supabase.from("payroll_periods").delete().eq("id", id);
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "delete",
    entity: "payroll_period",
    entity_id: id,
    summary: `Deleted draft payroll run ${formatPeriod(period.period_start, period.period_end)}`,
  });

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
    .select("status, period_start, period_end")
    .eq("id", periodId)
    .maybeSingle();
  if (!period) return { error: "Payroll period not found." };
  if (period.status === "finalized") {
    return { error: "This payroll period is already finalized and can't be changed." };
  }

  const [{ data: employee }, { data: loanRows }, { data: advanceRows }, { data: existing }] =
    await Promise.all([
      supabase.from("employees").select("*").eq("id", employeeId).maybeSingle(),
      supabase.from("loans").select("*").eq("employee_id", employeeId),
      supabase.from("advances").select("*").eq("employee_id", employeeId).eq("is_active", true),
      supabase
        .from("payroll_entries")
        .select("id")
        .eq("period_id", periodId)
        .eq("employee_id", employeeId)
        .maybeSingle(),
    ]);
  if (!employee) return { error: "Employee not found." };

  const { row } = buildEntryRow(
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

  await logTransaction(supabase, {
    action: existing ? "update" : "create",
    entity: "payroll_entry",
    entity_id: employeeId,
    summary: `${existing ? "Updated" : "Computed"} payroll for ${fullName(
      employee as Employee
    )} (${formatPeriod(period.period_start, period.period_end)}) — net ${formatPHP(
      row.net_weekly_pay
    )}`,
    details: {
      days_worked: row.days_worked,
      days_on_leave: row.days_on_leave,
      net: row.net_weekly_pay,
    },
  });

  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/");
  return {
    ok: true,
    netWeeklyPay: row.net_weekly_pay,
    isNetNonPositive: row.net_weekly_pay <= 0,
  };
}

export async function finalizePeriod(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("period_start, period_end, version")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.rpc("finalize_payroll_period", { p_period_id: id });
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "finalize",
    entity: "payroll_period",
    entity_id: id,
    summary: period
      ? `Finalized payroll run ${formatPeriod(period.period_start, period.period_end)}${
          (period.version ?? 1) > 1 ? ` (v${period.version})` : ""
        }`
      : "Finalized payroll run",
  });

  revalidatePath(`/payroll/${id}`);
  revalidatePath("/payroll");
  revalidatePath("/employees");
  revalidatePath("/");
  return { ok: true };
}

/** Amend a finalized run: reverse balance effects and reopen it as a draft. */
export async function reopenPeriod(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("period_start, period_end")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.rpc("reopen_payroll_period", { p_period_id: id });
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "amend",
    entity: "payroll_period",
    entity_id: id,
    summary: period
      ? `Reopened payroll run ${formatPeriod(
          period.period_start,
          period.period_end
        )} for amendment`
      : "Reopened payroll run for amendment",
  });

  revalidatePath(`/payroll/${id}`);
  revalidatePath("/payroll");
  revalidatePath("/employees");
  revalidatePath("/");
  return { ok: true };
}
