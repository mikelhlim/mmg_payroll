-- ============================================================================
-- Payroll-run guardrails:
--   - net pay of exactly ₱0 is always acceptable (no longer needs a covering
--     advance) — only a genuinely negative net pay blocks finalize
--   - sleep_days / overtime_days can never exceed days_worked
--   - a loan repayment can never exceed the loan's remaining balance or its
--     original principal
-- ============================================================================

-- One live draft (Fluffy Lim, period 2026-07-20..26) has sleep_days=8 with
-- days_worked=4, entered while exploring the independent Sleep Days field
-- before this cap existed. Clamp it down so the CHECK constraints below can
-- be added as normal (validating) constraints. It's an unfinalized draft, so
-- this doesn't touch any locked financial history.
update payroll_entries set sleep_days = days_worked where sleep_days > days_worked;
update payroll_entries set overtime_days = days_worked where overtime_days > days_worked;

alter table payroll_entries
  add constraint chk_sleep_days_le_days_worked check (sleep_days <= days_worked);
alter table payroll_entries
  add constraint chk_overtime_days_le_days_worked check (overtime_days <= days_worked);

-- ============================================================================
-- Loan repayment cap: spans two tables (payroll_entries vs. loans), so it
-- can't be a plain CHECK constraint — mirrors enforce_max_active_advances().
-- Payments are already clamped app-side (buildEntryRow); this is the
-- defense-in-depth backstop against direct/bypassing writes.
-- ============================================================================
create or replace function public.enforce_loan_payment_caps()
returns trigger language plpgsql as $$
declare
  v_balance numeric(12, 2);
  v_principal numeric(12, 2);
begin
  if new.sss_loan_payment > 0 then
    select current_balance, principal into v_balance, v_principal
      from loans where employee_id = new.employee_id and loan_type = 'SSS';
    if v_balance is null then
      raise exception 'Employee % has no SSS loan to repay', new.employee_id;
    end if;
    if new.sss_loan_payment > v_balance or new.sss_loan_payment > v_principal then
      raise exception 'SSS loan payment (%) for employee % exceeds the remaining balance (%) or principal (%)',
        new.sss_loan_payment, new.employee_id, v_balance, v_principal;
    end if;
  end if;

  if new.pagibig_loan_payment > 0 then
    select current_balance, principal into v_balance, v_principal
      from loans where employee_id = new.employee_id and loan_type = 'PAGIBIG';
    if v_balance is null then
      raise exception 'Employee % has no Pag-IBIG loan to repay', new.employee_id;
    end if;
    if new.pagibig_loan_payment > v_balance or new.pagibig_loan_payment > v_principal then
      raise exception 'Pag-IBIG loan payment (%) for employee % exceeds the remaining balance (%) or principal (%)',
        new.pagibig_loan_payment, new.employee_id, v_balance, v_principal;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_loan_payment_caps on payroll_entries;
create trigger trg_loan_payment_caps
  before insert or update on payroll_entries
  for each row execute function public.enforce_loan_payment_caps();

-- ============================================================================
-- finalize_payroll_period — same as the previous version, except the guard
-- now blocks ONLY a genuinely negative net pay. Net = 0 is always fine, so
-- the shortfall_covered escape hatch for net = 0 is no longer needed (the
-- column itself is untouched — still set by coverShortfallWithAdvance and
-- still shown on the payslip/report as an explanatory line).
-- ============================================================================
create or replace function public.finalize_payroll_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_period_days integer;
  v_entry payroll_entries%rowtype;
  v_advance_id uuid;
  v_amount numeric(12, 2);
  v_new_balance numeric(12, 2);
  v_loan_id uuid;
begin
  if not public.is_authenticated() then
    raise exception 'Not authorized';
  end if;

  select status, (period_end - period_start + 1) into v_status, v_period_days
  from payroll_periods where id = p_period_id for update;
  if v_status is null then
    raise exception 'Payroll period % not found', p_period_id;
  end if;
  if v_status = 'finalized' then
    raise exception 'Payroll period is already finalized';
  end if;

  for v_entry in select * from payroll_entries where period_id = p_period_id loop
    -- Days accounted for must equal the period length.
    if (v_entry.days_worked + v_entry.days_on_leave) <> v_period_days then
      raise exception
        'Employee %: days worked + leave (%) must equal the % day pay period',
        v_entry.employee_id, (v_entry.days_worked + v_entry.days_on_leave), v_period_days;
    end if;

    -- Block finalize on negative net pay only — ₱0 is fine.
    if v_entry.net_weekly_pay < 0 then
      raise exception 'Employee % has a negative net pay (%). Resolve before finalizing.',
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
