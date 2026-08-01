# PayDay — HR & Payroll Computation System

An in-house weekly payroll system for a Philippine daily-wage workforce. Back-office
staff manage employee profiles, run weekly payroll (Saturday–Friday) employee-by-employee
with live net-pay computation, finalize atomically (drawing down loan/advance balances),
and generate payslip PDFs.

Built with **Next.js 16 (App Router) · React 19 · TypeScript · Supabase · Tailwind v4 · shadcn/ui (base-nova)**.

## Features

- **Auth** — email/password (Supabase), forced password change on first login, admin/staff roles.
- **Employees** — full profile (names, nickname, birthdate, employment date, gov't IDs, a free-text
  notes field), compensation (daily wage, daily overtime fee, food/sleep allowance), an optional
  department assignment, SSS/Pag-IBIG loans, and up to 5 cash advances. Everywhere an employee is
  listed or shows up in a generated report, their name reads "Last, Nickname" (falling back to
  first name when there's no nickname on record).
- **Departments** — organize employees into departments with a managed processing order (Admin →
  Departments: create/rename/reorder/delete). Every list of employees — the employee list, the
  payroll roster and stepper, Reports' employee directory, and the payslip PDF — is grouped by
  department in that order, with unassigned employees listed last. The dashboard's "Active
  advances"/"Open loans" tiles link to a department-grouped list of every individual active advance
  or open loan (not just the affected employees) — full detail per record, so one employee holding
  two advances (or both an SSS and a Pag-IBIG loan) shows up as two separate rows.
- **Payroll** — weekly runs processed in department order; per-employee compute with a live
  breakdown (days on leave is derived from days worked and locked, never hand-editable; sleep days
  has no auto-fill relationship to days worked at all — fully independent, may exceed it; overtime
  days may not); a negative net pay blocks finalize (net = ₱0 is fine) and can be resolved in-flow
  by issuing an advance for the shortfall; atomic finalize (`finalize_payroll_period` RPC) that
  records payslips and decrements every loan/advance balance with payment history.
- **Payslip PDF** — one payslip per employee page (showing each loan/advance's remaining balance
  alongside the period's deduction, but no gov't ID numbers) plus a company summary page grouped by
  department with a subtotal each, and the grand total. Two specific employees are hardcoded to be
  omitted from both the payslip and the summary for any period where their net pay is exactly ₱0 —
  an explicit one-off, not a general rule.
- **Expense reports** — one per week, created independently of any payroll run, entered as line
  items grouped by an admin-managed expense type (Mau Expenses, Mau GCash/Transfer, Hardware
  Expenses, Miscellaneous Expenses by default). Can't be finalized until a payroll total is
  attached — either linking a finalized payroll run (its net-pay total is read live from then on,
  even after finalize) or typing an amount manually. A Total Expenses card rolls that total up
  alongside each type's subtotal into a grand total. Each type always shows at least 10 editable
  rows (Date/Description/Amount), dynamically add/deletable; a new report carries forward the
  previous one's non-blank descriptions per type. Same lifecycle as payroll (draft → save →
  finalize, with amend-to-reopen) and its own PDF — expense types can also be flagged to give each
  of their line items a dedicated detail page in the PDF, in addition to the summary table
  (on by default for Miscellaneous Expenses).
- **Reports** — an Employees tab lists everyone, grouped by department, linking to a per-employee
  page with profile, loan/advance balances, full payslip history (every finalized period, with a
  PDF link each), and payment history (including any manual balance adjustments, kept reconciled
  with the live balance); an Expenses tab for browsing expense reports.
- **Admin** — user management (add/change role/delete), department management, expense-type
  management, an audit log of every mutation (`/admin/logs`), and "Delete all data except admin".

Payroll math is a pure, unit-tested module (`src/lib/payroll/calculator.ts`); all money is
computed in integer centavos to avoid floating-point drift.

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

This project is wired to a Supabase project. To use your own:

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, paste and run [`supabase/schema.sql`](supabase/schema.sql) (idempotent — safe to re-run).
3. Copy `.env.example` to `.env.local` and fill in the values from
   **Dashboard → Project Settings → API** (URL, anon key, service_role key).

### 3. Seed the initial admin

```bash
npm run seed:admin
```

Creates the admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env.local`, forced to
change the password on first login. Refuses to touch an account that already exists unless run
with `--force` (or `FORCE_RESEED=1`), so re-running it later won't reset a live admin's password.

### 4. Run

```bash
npm run dev          # http://localhost:3200
npm run build        # production build
npm test             # payroll calculator unit tests
```

## Architecture

- **`src/proxy.ts`** — auth gate (Next.js 16 renamed middleware → proxy); refreshes the session,
  redirects unauthenticated users, enforces forced-password-change and admin-only routes.
- **`src/lib/supabase/{client,server,admin}.ts`** — browser, SSR, and service-role clients.
- **`src/lib/actions/*`** — server actions (zod-validated) for all mutations.
- **`src/lib/payroll/*`** — the pure calculator, entry builder, and period helpers.
- **`supabase/schema.sql`** — tables, RLS, the `finalize_payroll_period` and `admin_wipe_all_data`
  RPCs (both `SECURITY DEFINER`), and the ≤5-advances trigger.

Money columns are `numeric(12,2)`; the app computes in integer centavos (`src/lib/money.ts`).
Each payroll entry snapshots the employee's rates so historical payslips never change.

## Deploy

Deploy to **Vercel** (set the same env vars in the project settings) with **Supabase Cloud** as
the backend. A native SwiftUI iOS client can be added later against the same Supabase backend.
