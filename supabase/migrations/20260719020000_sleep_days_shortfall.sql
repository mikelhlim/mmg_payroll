-- ============================================================================
-- Sleep days (independent from days worked) + shortfall-covered-by-advance
-- ============================================================================

alter table payroll_entries add column if not exists sleep_days numeric(6, 2) not null default 0;
alter table payroll_entries add column if not exists shortfall_covered numeric(12, 2) not null default 0;

-- ============================================================================
-- finalize_payroll_period — same as before, except the non-positive-net guard
-- now allows a net of EXACTLY 0 when the entry's shortfall was explicitly
-- covered by a new advance (shortfall_covered > 0), via the dedicated
-- "cover shortfall" action. A genuinely negative net, or an uncovered net of
-- 0, still blocks finalize — unchanged from before.
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

    -- Block finalize on negative net pay, or zero net pay that was not
    -- explicitly resolved via a covering advance.
    if v_entry.net_weekly_pay < 0
       or (v_entry.net_weekly_pay = 0 and coalesce(v_entry.shortfall_covered, 0) = 0) then
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
