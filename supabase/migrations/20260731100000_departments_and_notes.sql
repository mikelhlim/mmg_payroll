-- ============================================================================
-- Departments: employees can be assigned to a department; the employee list
-- and payroll-run processing order are grouped by department. Also adds
-- employees.notes (edited from the profile and inline during payroll runs),
-- and removes the sleep_days <= days_worked cap added in
-- 20260722060000_payroll_run_guardrails.sql — sleep days are independent of
-- days worked and may exceed it. The overtime_days <= days_worked cap stays.
-- ============================================================================

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Processing/display order. No uniqueness constraint on purpose: reordering
  -- swaps two rows' sort_order via two sequential UPDATEs, which would
  -- transiently collide under a unique constraint (Postgres checks UNIQUE
  -- immediately, not deferred).
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_departments_updated_at on departments;
create trigger trg_departments_updated_at
  before update on departments
  for each row execute function public.set_updated_at();

alter table departments enable row level security;
drop policy if exists departments_authenticated_all on departments;
create policy departments_authenticated_all on departments
  for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

-- Seed the three known departments, in the given processing order. Re-run
-- safe: a name collision is a no-op (existing rows/order untouched).
insert into departments (name, sort_order) values
  ('Buliran', 1),
  ('Foliage', 2),
  ('Anilao-Tagbakin', 3)
on conflict (name) do nothing;

-- Employees ------------------------------------------------------------------
alter table employees add column if not exists department_id uuid references departments (id) on delete set null;
alter table employees add column if not exists notes text;
create index if not exists idx_employees_department on employees (department_id);

-- Payroll-run guardrail reversal ----------------------------------------------
-- Sleep days may now exceed days worked (independent field). Overtime days
-- remains capped — chk_overtime_days_le_days_worked is untouched.
alter table payroll_entries drop constraint if exists chk_sleep_days_le_days_worked;
