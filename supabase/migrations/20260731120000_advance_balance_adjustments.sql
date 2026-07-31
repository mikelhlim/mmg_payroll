-- ============================================================================
-- Advance balance adjustments
--
-- Bug this closes: editing an advance's current_balance directly (via the
-- employee-profile "Edit advance" dialog) had no connection at all to
-- payroll_advance_payments — the finalize-time payment ledger. An advance
-- with existing payment history could be edited to any new balance, and the
-- Employee Report would then show a live "Advances balance" card (reading
-- advances.current_balance) that permanently disagreed with the "Advance
-- Payment History" card (reading the last payment's immutable balance_after
-- snapshot). This was mistaken for a payroll double-deduction bug; it was
-- actually just an un-reconciled manual edit.
--
-- Fix: allow payroll_advance_payments rows that aren't tied to a real payroll
-- run — a manual "balance adjustment" entry, written whenever
-- updateAdvance() changes current_balance on an advance that already has
-- payment history (see savePayrollEntry's sibling, updateAdvance, in
-- src/lib/actions/obligations.ts). That keeps "last payment's balance_after"
-- always equal to the live balance, by construction, going forward.
-- ============================================================================

alter table payroll_advance_payments alter column payroll_entry_id drop not null;
alter table payroll_advance_payments add column if not exists note text;

-- Real payroll deductions are still never negative; a manual adjustment
-- (payroll_entry_id is null) may be positive or negative, since it can
-- correct the balance in either direction.
alter table payroll_advance_payments drop constraint if exists payroll_advance_payments_amount_check;
alter table payroll_advance_payments add constraint payroll_advance_payments_amount_check
  check (
    (payroll_entry_id is not null and amount >= 0)
    or (payroll_entry_id is null)
  );

comment on column payroll_advance_payments.payroll_entry_id is
  'Null for a manual balance adjustment (not tied to a payroll run) — see note.';
comment on column payroll_advance_payments.note is
  'Context for a manual adjustment row (payroll_entry_id is null). Null for ordinary payroll-driven payments.';
