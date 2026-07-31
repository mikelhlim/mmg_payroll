-- ============================================================================
-- Fix admin_wipe_all_data(): Supabase enables the pg_safeupdate extension by
-- default, which rejects any DELETE/UPDATE with no WHERE clause ("DELETE
-- requires a WHERE clause") as a blast-radius guard against accidental
-- full-table wipes. That's exactly what this function is *for*, so add a
-- trivially-true WHERE to each statement to satisfy the syntactic check
-- while keeping identical delete-everything semantics.
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
  delete from payroll_loan_payments where true;
  delete from payroll_advance_payments where true;
  delete from payroll_entries where true;
  delete from payroll_periods where true;
  delete from advances where true;
  delete from loans where true;
  delete from employees where true;
end;
$$;
