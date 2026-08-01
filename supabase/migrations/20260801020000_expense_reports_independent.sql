-- ============================================================================
-- Expense reports become independent of payroll runs: a report is created for
-- a period on its own (no payroll run required), and can only be finalized
-- once a payroll total is attached — either by linking a finalized payroll
-- run (live, recomputed on every read, same as before) or by typing a manual
-- amount (frozen, for weeks with no matching run in the system).
-- src/lib/actions/expenses.ts resolves which source applies; the two are
-- mutually exclusive (setting one clears the other server-side).
--
-- Also adds a per-category PDF flag: rather than hardcoding "Miscellaneous
-- Expenses" by name in the PDF renderer, an admin-managed boolean marks which
-- expense type(s) additionally get one full detail page per line item.
-- ============================================================================

-- payroll_period_id becomes optional.
alter table expense_periods alter column payroll_period_id drop not null;

-- Replace the plain unique constraint with a partial one: still at most one
-- expense report per payroll run once linked, but many reports may now sit
-- unlinked (or share no run) at once.
alter table expense_periods drop constraint if exists expense_periods_payroll_period_id_key;
create unique index if not exists expense_periods_payroll_period_id_key
  on expense_periods (payroll_period_id) where payroll_period_id is not null;

-- Manual payroll total, used only when no payroll run is linked.
alter table expense_periods add column if not exists payroll_total_override numeric(12, 2);
alter table expense_periods drop constraint if exists chk_expense_periods_payroll_total_override;
alter table expense_periods add constraint chk_expense_periods_payroll_total_override
  check (payroll_total_override is null or payroll_total_override >= 0);

-- One expense report per calendar period, same as payroll_periods — creation
-- no longer derives period_start/period_end from a linked run, so this needs
-- its own guard against duplicate weeks.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expense_periods_period_start_period_end_key'
  ) then
    alter table expense_periods add constraint expense_periods_period_start_period_end_key
      unique (period_start, period_end);
  end if;
end;
$$;

-- Per-category PDF layout: seeded true only for the one type that asked for
-- it, but it's a normal admin-editable column, not a name match in code.
alter table expense_categories add column if not exists per_item_pdf_pages boolean not null default false;
update expense_categories set per_item_pdf_pages = true where name = 'Miscellaneous Expenses';
