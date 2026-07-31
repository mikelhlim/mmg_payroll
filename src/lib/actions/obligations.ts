"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAuthenticated } from "@/lib/auth-role";
import { logTransaction } from "@/lib/transaction-log";
import { formatPHP } from "@/lib/money";
import {
  advanceSchema,
  loanSchema,
  MAX_ADVANCES,
  type AdvanceInput,
  type LoanInput,
} from "@/lib/validation/obligations";

type Result = { error: string } | { ok: true };

const round2 = (n: number) => Math.round(n * 100) / 100;
const nullify = (v: string) => (v.trim() ? v.trim() : null);

// ---- Loans (SSS / Pag-IBIG) — upserted per employee+type -------------------

export async function saveLoan(employeeId: string, raw: LoanInput): Promise<Result> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = loanSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { data: existing } = await supabase
    .from("loans")
    .select("current_balance")
    .eq("employee_id", employeeId)
    .eq("loan_type", v.loan_type)
    .maybeSingle();

  const { error } = await supabase.from("loans").upsert(
    {
      employee_id: employeeId,
      loan_type: v.loan_type,
      principal: round2(v.principal),
      current_balance: round2(v.current_balance),
      start_date: nullify(v.start_date),
    },
    { onConflict: "employee_id,loan_type" }
  );
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "update",
    entity: "loan",
    entity_id: employeeId,
    summary: `Saved ${v.loan_type} loan — balance ${formatPHP(v.current_balance)}`,
    details: { previous_balance: existing?.current_balance ?? null, new_balance: v.current_balance },
  });

  revalidatePath(`/employees/${employeeId}`);
  // A loan/advance added mid-run must show up in any open payroll compute page.
  revalidatePath("/payroll", "layout");
  revalidatePath("/");
  return { ok: true };
}

export async function clearLoan(employeeId: string, loanType: "SSS" | "PAGIBIG"): Promise<Result> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { error } = await supabase
    .from("loans")
    .delete()
    .eq("employee_id", employeeId)
    .eq("loan_type", loanType);
  if (error) {
    if (error.code === "23503") {
      return { error: "This loan has payment history and can't be removed." };
    }
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "delete",
    entity: "loan",
    entity_id: employeeId,
    summary: `Removed ${loanType} loan`,
  });

  revalidatePath(`/employees/${employeeId}`);
  // A loan/advance added mid-run must show up in any open payroll compute page.
  revalidatePath("/payroll", "layout");
  return { ok: true };
}

// ---- Advances (max 5 per employee) -----------------------------------------

export async function createAdvance(employeeId: string, raw: AdvanceInput): Promise<Result> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = advanceSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { count } = await supabase
    .from("advances")
    .select("*", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("is_active", true);
  if ((count ?? 0) >= MAX_ADVANCES) {
    return { error: `An employee can have at most ${MAX_ADVANCES} active advances.` };
  }

  const { error } = await supabase.from("advances").insert({
    employee_id: employeeId,
    label: nullify(v.label),
    start_date: nullify(v.start_date),
    total_advance: round2(v.total_advance),
    current_balance: round2(v.current_balance),
  });
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "create",
    entity: "advance",
    entity_id: employeeId,
    summary: `Added advance "${nullify(v.label) ?? "Advance"}" — ${formatPHP(v.current_balance)}`,
  });

  revalidatePath(`/employees/${employeeId}`);
  // A loan/advance added mid-run must show up in any open payroll compute page.
  revalidatePath("/payroll", "layout");
  revalidatePath("/");
  return { ok: true };
}

export type UpdateAdvanceResult = { error: string } | { warning: string } | { ok: true };

export async function updateAdvance(
  advanceId: string,
  employeeId: string,
  raw: AdvanceInput,
  confirm = false
): Promise<UpdateAdvanceResult> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const parsed = advanceSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const { data: existing } = await supabase
    .from("advances")
    .select("is_active, current_balance")
    .eq("id", advanceId)
    .maybeSingle();

  // Reactivating a previously paid-off advance is subject to the same
  // 5-advance cap as creating a new one — check proactively for a friendly
  // message instead of surfacing the raw DB trigger error.
  const willBeActive = round2(v.current_balance) > 0;
  if (willBeActive && !existing?.is_active) {
    const { count } = await supabase
      .from("advances")
      .select("*", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .neq("id", advanceId);
    if ((count ?? 0) >= MAX_ADVANCES) {
      return {
        error: `An employee can have at most ${MAX_ADVANCES} active advances. Remove or pay off another one first.`,
      };
    }
  }

  const newBalance = round2(v.current_balance);
  const previousBalance = existing?.current_balance ?? null;
  const balanceChanged = previousBalance !== null && newBalance !== previousBalance;

  // A balance edit on an advance that already has real payroll payment
  // history would otherwise silently desync the Employee Report's "Advances
  // balance" card (reads this live value) from its "Advance Payment History"
  // card (reads the last payment's balance_after snapshot) — precisely the
  // confusion that looks like a double-deduction bug but isn't one. Require
  // confirmation, then write a reconciling adjustment row so the two always
  // agree again (payroll_entry_id null marks it as a manual adjustment, not
  // a payroll-driven deduction).
  let hasPaymentHistory = false;
  if (balanceChanged) {
    const { count } = await supabase
      .from("payroll_advance_payments")
      .select("*", { count: "exact", head: true })
      .eq("advance_id", advanceId);
    hasPaymentHistory = (count ?? 0) > 0;
    if (hasPaymentHistory && !confirm) {
      return {
        warning: `This advance already has payroll payment history. Changing the balance from ${formatPHP(
          previousBalance!
        )} to ${formatPHP(newBalance)} will record a manual adjustment entry in the payment history so reports stay consistent. Continue?`,
      };
    }
  }

  const { error } = await supabase
    .from("advances")
    .update({
      label: nullify(v.label),
      start_date: nullify(v.start_date),
      total_advance: round2(v.total_advance),
      current_balance: newBalance,
      is_active: willBeActive,
    })
    .eq("id", advanceId);
  if (error) return { error: error.message };

  if (balanceChanged && hasPaymentHistory) {
    const { error: adjError } = await supabase.from("payroll_advance_payments").insert({
      payroll_entry_id: null,
      advance_id: advanceId,
      amount: round2(newBalance - previousBalance!),
      balance_after: newBalance,
      note: `Manual balance adjustment (was ${formatPHP(previousBalance!)})`,
    });
    if (adjError) return { error: adjError.message };
  }

  await logTransaction(supabase, {
    action: "update",
    entity: "advance",
    entity_id: employeeId,
    summary: `Updated advance "${nullify(v.label) ?? "Advance"}" — balance ${formatPHP(newBalance)}${
      balanceChanged && hasPaymentHistory ? " (reconciled with payment history)" : ""
    }`,
    details: { previous_balance: previousBalance, new_balance: newBalance },
  });

  revalidatePath(`/employees/${employeeId}`);
  // A loan/advance added mid-run must show up in any open payroll compute page.
  revalidatePath("/payroll", "layout");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteAdvance(advanceId: string, employeeId: string): Promise<Result> {
  const supabase = await createClient();
  await assertAuthenticated(supabase);

  const { error } = await supabase.from("advances").delete().eq("id", advanceId);
  if (error) {
    if (error.code === "23503") {
      return { error: "This advance has payment history and can't be deleted." };
    }
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "delete",
    entity: "advance",
    entity_id: employeeId,
    summary: "Deleted an advance",
  });

  revalidatePath(`/employees/${employeeId}`);
  // A loan/advance added mid-run must show up in any open payroll compute page.
  revalidatePath("/payroll", "layout");
  revalidatePath("/");
  return { ok: true };
}
