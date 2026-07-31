-- ============================================================================
-- Fix: trg_expense_periods_updated_at (added in the expense reports migration,
-- 20260801000000) requires an `updated_at` column that expense_periods was
-- never actually given — every UPDATE on the table (finalize, reopen) failed
-- with 'record "new" has no field "updated_at"'. expense_items and
-- expense_categories both already have the column; only expense_periods was
-- missing it.
-- ============================================================================
alter table expense_periods add column if not exists updated_at timestamptz not null default now();
