// Data-integrity checks against the current project (env).
//   node --env-file=.env.local scripts/integrity-check.mjs
import { createClient } from "@supabase/supabase-js";

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;
let issues = 0;
const fail = (msg) => {
  console.log("  ✗ " + msg);
  issues++;
};

// 1) Entry arithmetic: net = gross - total_deductions, and total_deductions is
//    the sum of its parts; advance_allocations sum to total_advance_deduction.
const { data: entries } = await c.from("payroll_entries").select("*");
for (const e of entries) {
  if (!near(e.net_weekly_pay, e.gross_weekly_salary - e.total_deductions))
    fail(`entry ${e.id}: net != gross - deductions`);
  const parts =
    Number(e.sss_contribution) +
    Number(e.pagibig_contribution) +
    Number(e.philhealth_contribution) +
    Number(e.sss_loan_payment) +
    Number(e.pagibig_loan_payment) +
    Number(e.total_advance_deduction);
  if (!near(parts, e.total_deductions)) fail(`entry ${e.id}: deduction parts != total`);
  const allocSum = (e.advance_allocations ?? []).reduce((s, a) => s + Number(a.amount), 0);
  if (!near(allocSum, e.total_advance_deduction))
    fail(`entry ${e.id}: advance_allocations sum != total_advance_deduction`);
}

// 2) Balances never negative.
const { data: loans } = await c.from("loans").select("id,current_balance");
const { data: advances } = await c.from("advances").select("id,current_balance");
for (const l of loans) if (Number(l.current_balance) < 0) fail(`loan ${l.id} negative balance`);
for (const a of advances)
  if (Number(a.current_balance) < 0) fail(`advance ${a.id} negative balance`);

// 3) The most recent payment's balance_after must equal the obligation's
//    current balance (payment history reconciles with the live balance).
for (const l of loans) {
  const { data: pays } = await c
    .from("payroll_loan_payments")
    .select("balance_after,created_at")
    .eq("loan_id", l.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (pays?.length && !near(pays[0].balance_after, l.current_balance))
    fail(`loan ${l.id}: last payment balance_after != current_balance`);
}
for (const a of advances) {
  const { data: pays } = await c
    .from("payroll_advance_payments")
    .select("balance_after,created_at")
    .eq("advance_id", a.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (pays?.length && !near(pays[0].balance_after, a.current_balance))
    fail(`advance ${a.id}: last payment balance_after != current_balance`);
}

// 4) Payment history only exists for finalized periods.
const { data: pfinal } = await c
  .from("payroll_periods")
  .select("id,status");
const draftIds = new Set(pfinal.filter((p) => p.status !== "finalized").map((p) => p.id));
const { data: allLoanPays } = await c
  .from("payroll_loan_payments")
  .select("payroll_entry_id, payroll_entries(period_id)");
for (const p of allLoanPays ?? []) {
  if (draftIds.has(p.payroll_entries?.period_id))
    fail(`loan payment ${p.payroll_entry_id} belongs to a draft period`);
}

console.log(`\nChecked ${entries.length} entries, ${loans.length} loans, ${advances.length} advances.`);
console.log(issues === 0 ? "✅ ALL INTEGRITY CHECKS PASSED" : `❌ ${issues} ISSUE(S) FOUND`);
process.exit(issues === 0 ? 0 : 1);
