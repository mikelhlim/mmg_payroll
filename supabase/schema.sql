-- ============================================================================
-- HR & Payroll Computation System — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query →
-- paste → Run). Safe to re-run: uses IF NOT EXISTS / OR REPLACE / drop-then-
-- create for policies, and ALTER ... ADD COLUMN IF NOT EXISTS for migrations.
--
-- Users (admin/staff) are Supabase auth.users — role + must_change_password
-- live in app_metadata, full name in user_metadata. Employees do NOT log in.
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================================
-- Role helpers (read from the caller's JWT)
-- ============================================================================
-- Any authenticated back-office user (admin or staff).
create or replace function public.is_authenticated()
returns boolean language sql stable as $$
  select auth.uid() is not null;
$$;

-- The caller's app role. A missing/blank role defaults to 'admin' — this only
-- ever applies to the seeded bootstrap admin; every account created through
-- the app is given an explicit role. Mirrors src/lib/auth-role.ts.
create or replace function public.app_role()
returns text language sql stable as $$
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'admin');
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.is_authenticated() and public.app_role() = 'admin';
$$;

-- ============================================================================
-- Shared triggers
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Tables
-- ============================================================================

-- Employees ------------------------------------------------------------------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  middle_name text,
  nickname text,
  birthdate date,
  employment_date date,
  -- Government IDs
  sss_number text,
  philhealth_number text,
  pagibig_number text,
  -- Compensation (per day, in PHP)
  daily_wage numeric(12, 2) not null default 0 check (daily_wage >= 0),
  overtime_fee numeric(12, 2) not null default 0 check (overtime_fee >= 0), -- fixed daily OT fee
  food_allowance_per_day numeric(12, 2) not null default 0 check (food_allowance_per_day >= 0),
  sleep_allowance_per_day numeric(12, 2) not null default 0 check (sleep_allowance_per_day >= 0),
  -- Default weekly statutory contribution amounts (editable per payroll week)
  sss_contribution numeric(12, 2) not null default 0 check (sss_contribution >= 0),
  pagibig_contribution numeric(12, 2) not null default 0 check (pagibig_contribution >= 0),
  philhealth_contribution numeric(12, 2) not null default 0 check (philhealth_contribution >= 0),
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_employees_updated_at on employees;
create trigger trg_employees_updated_at
  before update on employees
  for each row execute function public.set_updated_at();

-- Advances (max 5 active per employee) ---------------------------------------
create table if not exists advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  label text,
  start_date date,
  total_advance numeric(12, 2) not null default 0 check (total_advance >= 0),
  current_balance numeric(12, 2) not null default 0 check (current_balance >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_advances_employee on advances (employee_id);

create or replace function public.enforce_max_active_advances()
returns trigger language plpgsql as $$
begin
  if (
    select count(*) from advances
    where employee_id = new.employee_id and is_active
  ) > 5 then
    raise exception 'An employee can have at most 5 active advances';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_max_active_advances on advances;
create constraint trigger trg_max_active_advances
  after insert or update on advances
  deferrable initially immediate
  for each row execute function public.enforce_max_active_advances();

-- Government loans (SSS, Pag-IBIG) — at most one of each per employee --------
create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  loan_type text not null check (loan_type in ('SSS', 'PAGIBIG')),
  principal numeric(12, 2) not null default 0 check (principal >= 0),
  current_balance numeric(12, 2) not null default 0 check (current_balance >= 0),
  start_date date,
  created_at timestamptz not null default now(),
  unique (employee_id, loan_type)
);
create index if not exists idx_loans_employee on loans (employee_id);

-- Payroll periods (weekly, Sat–Fri by default, adjustable) -------------------
create table if not exists payroll_periods (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (period_start, period_end)
);

-- Payroll entries (one per employee per period) ------------------------------
create table if not exists payroll_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references payroll_periods (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete restrict,
  -- Inputs
  days_worked numeric(6, 2) not null default 0 check (days_worked >= 0),
  days_on_leave numeric(6, 2) not null default 0 check (days_on_leave >= 0),
  overtime_days numeric(6, 2) not null default 0 check (overtime_days >= 0),
  -- Rate snapshot (so historical payslips never change if the profile is edited)
  daily_wage numeric(12, 2) not null default 0,
  overtime_fee numeric(12, 2) not null default 0,
  food_allowance_per_day numeric(12, 2) not null default 0,
  sleep_allowance_per_day numeric(12, 2) not null default 0,
  -- Computed earnings
  total_food_allowance numeric(12, 2) not null default 0,
  total_sleep_allowance numeric(12, 2) not null default 0,
  weekly_salary numeric(12, 2) not null default 0,
  overtime_amount numeric(12, 2) not null default 0,
  gross_weekly_salary numeric(12, 2) not null default 0,
  -- Deductions
  sss_contribution numeric(12, 2) not null default 0,
  pagibig_contribution numeric(12, 2) not null default 0,
  philhealth_contribution numeric(12, 2) not null default 0,
  sss_loan_payment numeric(12, 2) not null default 0,
  pagibig_loan_payment numeric(12, 2) not null default 0,
  total_advance_deduction numeric(12, 2) not null default 0,
  total_deductions numeric(12, 2) not null default 0,
  net_weekly_pay numeric(12, 2) not null default 0,
  -- Per-advance breakdown for this week: [{ "advance_id": uuid, "amount": num }]
  advance_allocations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, employee_id)
);
create index if not exists idx_entries_period on payroll_entries (period_id);
create index if not exists idx_entries_employee on payroll_entries (employee_id);

drop trigger if exists trg_entries_updated_at on payroll_entries;
create trigger trg_entries_updated_at
  before update on payroll_entries
  for each row execute function public.set_updated_at();

-- Payment history (written at finalize time) ---------------------------------
create table if not exists payroll_advance_payments (
  id uuid primary key default gen_random_uuid(),
  payroll_entry_id uuid not null references payroll_entries (id) on delete cascade,
  advance_id uuid not null references advances (id) on delete restrict,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  balance_after numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_adv_pay_entry on payroll_advance_payments (payroll_entry_id);
create index if not exists idx_adv_pay_advance on payroll_advance_payments (advance_id);

create table if not exists payroll_loan_payments (
  id uuid primary key default gen_random_uuid(),
  payroll_entry_id uuid not null references payroll_entries (id) on delete cascade,
  loan_id uuid not null references loans (id) on delete restrict,
  loan_type text not null,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  balance_after numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_loan_pay_entry on payroll_loan_payments (payroll_entry_id);
create index if not exists idx_loan_pay_loan on payroll_loan_payments (loan_id);

-- ============================================================================
-- Row Level Security
-- Back-office only: any authenticated user (admin or staff) may read/write the
-- domain tables. Admin-only actions (user management, data wipe) are guarded in
-- server actions + the wipe RPC, not here.
-- ============================================================================
alter table employees enable row level security;
alter table advances enable row level security;
alter table loans enable row level security;
alter table payroll_periods enable row level security;
alter table payroll_entries enable row level security;
alter table payroll_advance_payments enable row level security;
alter table payroll_loan_payments enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'employees', 'advances', 'loans', 'payroll_periods',
    'payroll_entries', 'payroll_advance_payments', 'payroll_loan_payments'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (public.is_authenticated()) with check (public.is_authenticated())',
      t || '_authenticated_all', t
    );
  end loop;
end;
$$;

-- ============================================================================
-- RPC: finalize a payroll period atomically
-- Persists nothing new about the entries themselves (the app has already saved
-- draft entries) but: validates every net pay > 0, decrements each advance and
-- loan balance, and writes the payment-history rows — all in one transaction.
-- ============================================================================
create or replace function public.finalize_payroll_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_entry payroll_entries%rowtype;
  v_advance_id uuid;
  v_amount numeric(12, 2);
  v_new_balance numeric(12, 2);
  v_loan_id uuid;
begin
  if not public.is_authenticated() then
    raise exception 'Not authorized';
  end if;

  select status into v_status from payroll_periods where id = p_period_id for update;
  if v_status is null then
    raise exception 'Payroll period % not found', p_period_id;
  end if;
  if v_status = 'finalized' then
    raise exception 'Payroll period is already finalized';
  end if;

  for v_entry in select * from payroll_entries where period_id = p_period_id loop
    -- Block finalize on any non-positive net pay.
    if v_entry.net_weekly_pay <= 0 then
      raise exception 'Employee % has a non-positive net pay (%). Resolve before finalizing.',
        v_entry.employee_id, v_entry.net_weekly_pay;
    end if;

    -- Advances: apply each per-advance allocation.
    for v_advance_id, v_amount in
      select (a ->> 'advance_id')::uuid, (a ->> 'amount')::numeric
      from jsonb_array_elements(coalesce(v_entry.advance_allocations, '[]'::jsonb)) as a
    loop
      if v_amount is null or v_amount <= 0 then
        continue;
      end if;
      update advances
        set current_balance = current_balance - v_amount
        where id = v_advance_id
        returning current_balance into v_new_balance;
      if not found then
        raise exception 'Advance % not found', v_advance_id;
      end if;
      if v_new_balance < 0 then
        raise exception 'Advance % would go negative', v_advance_id;
      end if;
      update advances set is_active = false where id = v_advance_id and current_balance = 0;
      insert into payroll_advance_payments (payroll_entry_id, advance_id, amount, balance_after)
        values (v_entry.id, v_advance_id, v_amount, v_new_balance);
    end loop;

    -- SSS loan repayment.
    if v_entry.sss_loan_payment > 0 then
      select id into v_loan_id from loans
        where employee_id = v_entry.employee_id and loan_type = 'SSS' for update;
      if v_loan_id is null then
        raise exception 'Employee % has no SSS loan to repay', v_entry.employee_id;
      end if;
      update loans set current_balance = current_balance - v_entry.sss_loan_payment
        where id = v_loan_id returning current_balance into v_new_balance;
      if v_new_balance < 0 then
        raise exception 'SSS loan for employee % would go negative', v_entry.employee_id;
      end if;
      insert into payroll_loan_payments (payroll_entry_id, loan_id, loan_type, amount, balance_after)
        values (v_entry.id, v_loan_id, 'SSS', v_entry.sss_loan_payment, v_new_balance);
    end if;

    -- Pag-IBIG loan repayment.
    if v_entry.pagibig_loan_payment > 0 then
      select id into v_loan_id from loans
        where employee_id = v_entry.employee_id and loan_type = 'PAGIBIG' for update;
      if v_loan_id is null then
        raise exception 'Employee % has no Pag-IBIG loan to repay', v_entry.employee_id;
      end if;
      update loans set current_balance = current_balance - v_entry.pagibig_loan_payment
        where id = v_loan_id returning current_balance into v_new_balance;
      if v_new_balance < 0 then
        raise exception 'Pag-IBIG loan for employee % would go negative', v_entry.employee_id;
      end if;
      insert into payroll_loan_payments (payroll_entry_id, loan_id, loan_type, amount, balance_after)
        values (v_entry.id, v_loan_id, 'PAGIBIG', v_entry.pagibig_loan_payment, v_new_balance);
    end if;
  end loop;

  update payroll_periods
    set status = 'finalized', finalized_at = now()
    where id = p_period_id;
end;
$$;

-- ============================================================================
-- RPC: delete all domain data (admin only). Non-admin auth users are removed
-- separately via a service-role Edge Function (see supabase/functions).
-- ============================================================================
create or replace function public.admin_wipe_all_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete all data';
  end if;
  delete from payroll_loan_payments;
  delete from payroll_advance_payments;
  delete from payroll_entries;
  delete from payroll_periods;
  delete from advances;
  delete from loans;
  delete from employees;
end;
$$;

grant execute on function public.finalize_payroll_period(uuid) to authenticated;
grant execute on function public.admin_wipe_all_data() to authenticated;

-- ============================================================================
-- Amendments & audit log (see migration 20260718090000). Re-run safe.
-- transaction_logs, payroll_periods.version/amended_at, reopen_payroll_period(),
-- and the day-validation inside finalize_payroll_period() are added there.
--
-- Sleep days & shortfall-covered-by-advance (see migration 20260719020000):
-- payroll_entries.sleep_days (independent from days_worked) and
-- .shortfall_covered (set when a negative net pay is resolved by issuing a
-- new advance instead); finalize_payroll_period()'s net-pay guard there
-- allows net = 0 specifically when shortfall_covered > 0.
--
-- The canonical, up-to-date definitions live in the migration files; this
-- schema.sql seeds a fresh database when combined with the migrations folder.
-- ============================================================================
