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
import { MAX_ADVANCES } from "@/lib/validation/obligations";
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
  | { ok: true; netWeeklyPay: number; isNetNegative: boolean; shortfallCovered: number };

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
        .select("id, shortfall_covered")
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

  // A prior shortfall stays covered as long as these same inputs still
  // produce the exact negative net pay it was issued for — otherwise a plain
  // re-save (e.g. clicking "Save & next" without changing anything) would
  // silently wipe shortfall_covered and revert net pay to negative. It's
  // only cleared once the inputs actually change the underlying picture.
  const priorShortfall = existing?.shortfall_covered ?? 0;
  const stillCovers = priorShortfall > 0 && row.net_weekly_pay === -priorShortfall;
  const shortfallCovered = stillCovers ? priorShortfall : 0;
  const netWeeklyPay = stillCovers ? 0 : row.net_weekly_pay;

  const { error } = await supabase.from("payroll_entries").upsert(
    {
      period_id: periodId,
      employee_id: employeeId,
      ...row,
      net_weekly_pay: netWeeklyPay,
      shortfall_covered: shortfallCovered,
    },
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
      netWeeklyPay
    )}`,
    details: {
      days_worked: row.days_worked,
      days_on_leave: row.days_on_leave,
      net: netWeeklyPay,
    },
  });

  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/");
  return {
    ok: true,
    netWeeklyPay,
    isNetNegative: netWeeklyPay < 0,
    shortfallCovered,
  };
}

export type CoverShortfallResult =
  | { error: string }
  | { ok: true; shortfall: number; foldedIntoExisting: boolean };

/**
 * Resolve a negative net pay by issuing a new advance for the exact shortfall:
 * the company effectively fronts the difference, the employee's net for this
 * period becomes ₱0 (not negative), and the shortfall becomes a normal
 * advance balance repaid via ordinary deductions in this or future periods.
 * Only a genuinely negative net pay blocks finalize — net = 0 is always fine.
 *
 * Idempotent per period: re-invoking this for the same employee+period (e.g.
 * the button clicked more than once) tops up the advance already issued for
 * THIS period rather than creating a duplicate. Only when no such advance
 * exists does it fall back to folding into the most-recently-created advance
 * (at the MAX_ADVANCES cap) or creating a brand new one.
 *
 * shortfall_covered is NOT a deduction (it's an advance issued to the
 * employee, the opposite of one), so total_deductions is left untouched —
 * net_weekly_pay = gross_weekly_salary - total_deductions + shortfall_covered
 * is the true invariant for a shortfall-covered entry (see integrity-check.mjs).
 */
export async function coverShortfallWithAdvance(
  periodId: string,
  employeeId: string,
  raw: PayrollEntryInput
): Promise<CoverShortfallResult> {
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

  const [{ data: employee }, { data: loanRows }, { data: advanceRows }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", employeeId).maybeSingle(),
    supabase.from("loans").select("*").eq("employee_id", employeeId),
    supabase.from("advances").select("*").eq("employee_id", employeeId).eq("is_active", true),
  ]);
  if (!employee) return { error: "Employee not found." };

  const activeAdvances = (advanceRows ?? []) as Advance[];

  const { row } = buildEntryRow(
    employee as Employee,
    (loanRows ?? []) as Loan[],
    activeAdvances,
    parsed.data
  );
  if (row.net_weekly_pay >= 0) {
    return { error: "Net pay isn't negative — there's no shortfall to cover." };
  }
  const shortfall = Math.abs(row.net_weekly_pay);
  const shortfallLabel = `Net pay shortfall (${formatPeriod(period.period_start, period.period_end)})`;

  // Re-covering the same period's shortfall (e.g. clicking the button again,
  // or after editing an unrelated field) must top up the advance already
  // issued for THIS period, never create a duplicate. Only when no such
  // advance exists do we consider folding into the most-recently-created one
  // (at the 5-advance cap) or creating a fresh one.
  const existingForThisPeriod = activeAdvances.find((a) => a.label === shortfallLabel);
  const mostRecent =
    !existingForThisPeriod && activeAdvances.length >= MAX_ADVANCES
      ? [...activeAdvances].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
      : null;
  const topUpTarget = existingForThisPeriod ?? mostRecent;

  if (topUpTarget) {
    const { error: topUpError } = await supabase
      .from("advances")
      .update({
        total_advance: topUpTarget.total_advance + shortfall,
        current_balance: topUpTarget.current_balance + shortfall,
      })
      .eq("id", topUpTarget.id);
    if (topUpError) return { error: topUpError.message };
  } else {
    const { error: advanceError } = await supabase.from("advances").insert({
      employee_id: employeeId,
      label: shortfallLabel,
      start_date: period.period_start,
      total_advance: shortfall,
      current_balance: shortfall,
    });
    if (advanceError) return { error: advanceError.message };
  }

  const { error: entryError } = await supabase.from("payroll_entries").upsert(
    { period_id: periodId, employee_id: employeeId, ...row, net_weekly_pay: 0, shortfall_covered: shortfall },
    { onConflict: "period_id,employee_id" }
  );
  if (entryError) return { error: entryError.message };

  await logTransaction(supabase, {
    action: "update",
    entity: "payroll_entry",
    entity_id: employeeId,
    summary: existingForThisPeriod
      ? `Covered a further ${formatPHP(shortfall)} shortfall for ${fullName(
          employee as Employee
        )} by topping up the existing shortfall advance for this period (${formatPeriod(period.period_start, period.period_end)})`
      : mostRecent
        ? `Covered a ${formatPHP(shortfall)} shortfall for ${fullName(
            employee as Employee
          )} by adding it to their "${mostRecent.label ?? "existing"}" advance (already at the ${MAX_ADVANCES}-advance limit; ${formatPeriod(period.period_start, period.period_end)})`
        : `Covered a ${formatPHP(shortfall)} shortfall for ${fullName(
            employee as Employee
          )} with a new advance (${formatPeriod(period.period_start, period.period_end)})`,
    details: { shortfall, foldedIntoAdvanceId: topUpTarget?.id ?? null },
  });

  revalidatePath(`/payroll/${periodId}`);
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/");
  return { ok: true, shortfall, foldedIntoExisting: Boolean(topUpTarget) };
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
