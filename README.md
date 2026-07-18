# PayDay — HR & Payroll Computation System

An in-house weekly payroll system for a Philippine daily-wage workforce. Back-office
staff manage employee profiles, run weekly payroll (Saturday–Friday) employee-by-employee
with live net-pay computation, finalize atomically (drawing down loan/advance balances),
and generate payslip PDFs.

Built with **Next.js 16 (App Router) · React 19 · TypeScript · Supabase · Tailwind v4 · shadcn/ui (base-nova)**.

## Features

- **Auth** — email/password (Supabase), forced password change on first login, admin/staff roles.
- **Employees** — full profile (names, nickname, birthdate, employment date, gov't IDs),
  compensation (daily wage, daily overtime fee, food/sleep allowance), weekly statutory
  contribution defaults, SSS/Pag-IBIG loans, and up to 5 cash advances.
- **Payroll** — weekly runs; per-employee compute with a live breakdown; alerts when net ≤ ₱0;
  atomic finalize (`finalize_payroll_period` RPC) that records payslips and decrements every
  loan/advance balance with payment history.
- **Payslip PDF** — one payslip per employee page + a company summary page with the grand total.
- **Reports** — per-employee profile, loan/advance balances, payslip history, and payment history.
- **Admin** — user management (add/change role/delete) and "Delete all data except admin".

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
change the password on first login.

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
