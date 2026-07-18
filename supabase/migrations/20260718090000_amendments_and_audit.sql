-- ============================================================================
-- Amendments, audit log, and payroll validation
-- ============================================================================

-- Transaction (audit) log -----------------------------------------------------
create table if not exists transaction_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,        -- create | update | delete | finalize | amend | reopen | wipe
  entity text not null,        -- employee | advance | loan | payroll_period | payroll_entry | user | data
  entity_id uuid,
  summary text not null,
  details jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_txn_logs_created on transaction_logs (created_at desc);
create index if not exists idx_txn_logs_entity on transaction_logs (entity, entity_id);

alter table transaction_logs enable row level security;
drop policy if exists transaction_logs_read on transaction_logs;
create policy transaction_logs_read on transaction_logs
  for select to authenticated using (public.is_authenticated());
drop policy if exists transaction_logs_insert on transaction_logs;
create policy transaction_logs_insert on transaction_logs
  for insert to authenticated with check (public.is_authenticated());

-- Period versioning (for amendments) -----------------------------------------
alter table payroll_periods add column if not exists version integer not null default 1;
alter table payroll_periods add column if not exists amended_at timestamptz;

-- ============================================================================
-- finalize_payroll_period — now also validates that days_worked + days_on_leave
-- equals the number of days in the period, for every entry.
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
-- reopen_payroll_period — amend a finalized run: reverse every loan/advance
-- payment (restoring balances), delete the payment history, and return the
-- period to an editable draft with an incremented version. Atomic.
-- ============================================================================
create or replace function public.reopen_payroll_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  r record;
begin
  if not public.is_authenticated() then
    raise exception 'Not authorized';
  end if;

  select status into v_status from payroll_periods where id = p_period_id for update;
  if v_status is null then
    raise exception 'Payroll period % not found', p_period_id;
  end if;
  if v_status <> 'finalized' then
    raise exception 'Only finalized periods can be amended';
  end if;

  -- Restore advance balances, then drop the payment rows.
  for r in
    select ap.advance_id, ap.amount
    from payroll_advance_payments ap
    join payroll_entries e on e.id = ap.payroll_entry_id
    where e.period_id = p_period_id
  loop
    update advances
      set current_balance = current_balance + r.amount, is_active = true
      where id = r.advance_id;
  end loop;
  delete from payroll_advance_payments ap
    using payroll_entries e
    where ap.payroll_entry_id = e.id and e.period_id = p_period_id;

  -- Restore loan balances, then drop the payment rows.
  for r in
    select lp.loan_id, lp.amount
    from payroll_loan_payments lp
    join payroll_entries e on e.id = lp.payroll_entry_id
    where e.period_id = p_period_id
  loop
    update loans set current_balance = current_balance + r.amount where id = r.loan_id;
  end loop;
  delete from payroll_loan_payments lp
    using payroll_entries e
    where lp.payroll_entry_id = e.id and e.period_id = p_period_id;

  update payroll_periods
    set status = 'draft', finalized_at = null, amended_at = now(), version = version + 1
    where id = p_period_id;
end;
$$;

grant execute on function public.reopen_payroll_period(uuid) to authenticated;
