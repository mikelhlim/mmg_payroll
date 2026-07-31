-- ============================================================================
-- Expense reports: one per payroll run, entered as line items grouped by an
-- admin-managed expense type. Mirrors the payroll period lifecycle (draft →
-- finalize → amend) and the departments admin-managed-lookup pattern.
--
-- expense_periods.payroll_period_id is `on delete restrict`, not
-- cascade/set null: the linked run *is* this report's week (its net-pay
-- total is read live, not snapshotted), so a payroll run with an attached
-- expense report can't be deleted out from under it. src/lib/actions/payroll.ts
-- deletePeriod() pre-checks for an attached report and returns a friendly
-- error rather than letting this constraint fire as a raw Postgres message.
-- ============================================================================

-- Expense types (admin-managed lookup, mirrors `departments`) ----------------
create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- No unique constraint on sort_order: reordering swaps two rows' sort_order
  -- via two sequential UPDATEs, which would transiently collide under a
  -- unique constraint (Postgres checks UNIQUE immediately, not deferred).
  -- Same reasoning as departments.sort_order.
  sort_order integer not null default 0,
  -- Seeded line descriptions used only when a type has no prior expense
  -- report to carry descriptions forward from (the very first report, or a
  -- newly added type).
  default_descriptions text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_expense_categories_updated_at on expense_categories;
create trigger trg_expense_categories_updated_at
  before update on expense_categories
  for each row execute function public.set_updated_at();

-- Seed the four known expense types, in the given processing order. Re-run
-- safe: a name collision is a no-op (existing rows/order/descriptions untouched).
insert into expense_categories (name, sort_order, default_descriptions) values
  ('Mau Expenses',           1, '{}'),
  ('Mau GCash/Transfer',     2, '{}'),
  ('Hardware Expenses',      3, '{}'),
  ('Miscellaneous Expenses', 4, array['CTK Flowers','Anilao/Tagbakin','Ding','Mau','Michael'])
on conflict (name) do nothing;

-- One expense report per payroll run ------------------------------------------
create table if not exists expense_periods (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references payroll_periods (id) on delete restrict,
  -- Copied from the linked run at creation so labels/PDF don't need a join
  -- just to show the period dates.
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  version integer not null default 1,
  amended_at timestamptz,
  unique (payroll_period_id)
);
create index if not exists idx_expense_periods_payroll_period on expense_periods (payroll_period_id);

drop trigger if exists trg_expense_periods_updated_at on expense_periods;
create trigger trg_expense_periods_updated_at
  before update on expense_periods
  for each row execute function public.set_updated_at();

-- Expense line items -----------------------------------------------------------
create table if not exists expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_period_id uuid not null references expense_periods (id) on delete cascade,
  category_id uuid not null references expense_categories (id) on delete restrict,
  item_date date,
  description text,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_expense_items_period on expense_items (expense_period_id);
create index if not exists idx_expense_items_cat on expense_items (expense_period_id, category_id, sort_order);

drop trigger if exists trg_expense_items_updated_at on expense_items;
create trigger trg_expense_items_updated_at
  before update on expense_items
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security — same blanket authenticated-read/write policy as every
-- other domain table (see supabase/schema.sql's RLS section).
-- ============================================================================
alter table expense_categories enable row level security;
alter table expense_periods enable row level security;
alter table expense_items enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['expense_categories', 'expense_periods', 'expense_items'] loop
    execute format('drop policy if exists %I on %I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (public.is_authenticated()) with check (public.is_authenticated())',
      t || '_authenticated_all', t
    );
  end loop;
end;
$$;

-- ============================================================================
-- RPC: replace all line items for an expense report atomically.
-- Delete-and-reinsert is safe (nothing FKs to expense_items) and much simpler
-- than a diff/upsert, but must be transactional — hence the RPC rather than
-- two separate client calls.
-- p_items shape: [{ "category_id": uuid, "item_date": "yyyy-mm-dd"|null,
--                    "description": text|null, "amount": numeric, "sort_order": int }, ...]
-- ============================================================================
create or replace function public.save_expense_items(p_expense_period_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_authenticated() then
    raise exception 'Not authorized';
  end if;

  select status into v_status from expense_periods where id = p_expense_period_id for update;
  if v_status is null then
    raise exception 'Expense report % not found', p_expense_period_id;
  end if;
  if v_status = 'finalized' then
    raise exception 'This expense report is already finalized and can''t be changed';
  end if;

  delete from expense_items where expense_period_id = p_expense_period_id;

  insert into expense_items (expense_period_id, category_id, item_date, description, amount, sort_order)
  select
    p_expense_period_id,
    (item ->> 'category_id')::uuid,
    nullif(item ->> 'item_date', '')::date,
    nullif(item ->> 'description', ''),
    coalesce((item ->> 'amount')::numeric, 0),
    coalesce((item ->> 'sort_order')::int, 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item;
end;
$$;

grant execute on function public.save_expense_items(uuid, jsonb) to authenticated;

-- ============================================================================
-- admin_wipe_all_data(): must delete expense_items/expense_periods before
-- payroll_periods, since expense_periods.payroll_period_id is `on delete
-- restrict` (deleting payroll_periods first would make the whole wipe fail).
-- expense_categories is lookup data, kept — same treatment as departments.
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
  delete from expense_items where true;
  delete from expense_periods where true;
  delete from payroll_loan_payments where true;
  delete from payroll_advance_payments where true;
  delete from payroll_entries where true;
  delete from payroll_periods where true;
  delete from advances where true;
  delete from loans where true;
  delete from employees where true;
end;
$$;

grant execute on function public.admin_wipe_all_data() to authenticated;
