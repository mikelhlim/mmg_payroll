# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The import above pulls in AGENTS.md, which warns that this repo runs a version of Next.js with
breaking changes relative to training data (e.g. `middleware.ts` → `proxy.ts`, see "Request
flow / auth gate" below) and to check `node_modules/next/dist/docs/` before relying on prior
knowledge of Next.js APIs.

## Project

An in-house weekly payroll system for a Philippine daily-wage workforce (back-office only — there
is no employee self-service). Staff manage employee profiles, run payroll for a period
employee-by-employee with live net-pay computation, finalize atomically (drawing down loan/advance
balances), and generate payslip PDFs. The UI/app title is "MMG HR and Payroll System";
[README.md](README.md) still opens with the project's original name, "PayDay — HR & Payroll
Computation System" — same codebase, not out of date otherwise.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + Auth) · Tailwind v4 ·
shadcn/ui (`base-nova` style, base-ui primitives) · Vitest.

## Commands

```bash
npm install         # install deps
npm run dev          # dev server on http://localhost:3200 (next dev -p 3200)
npm run build        # production build
npm start            # serve a production build
npm run lint         # eslint
npm test             # vitest run — all unit tests, once
npm run test:watch   # vitest watch mode
npx vitest run <path/to/file.test.ts>   # run a single test file
npm run seed:admin   # create/reset the bootstrap admin user (reads .env.local)
```

Ad-hoc ops scripts — all read Supabase credentials from `.env.local` via `--env-file` and operate
on whatever project that file points at:

```bash
node --env-file=.env.local scripts/integrity-check.mjs                     # reconcile payroll math & balances against live data
node --env-file=.env.local scripts/backup-data.mjs [outPath]               # dump all domain tables + auth users to JSON
node --env-file=.env.local scripts/restore-data.mjs <backupPath>           # restore a JSON backup into the current project
npx tsx --env-file=.env.local scripts/render-pdf.mts <periodId> <outPath>  # render one period's payslip PDF to a file, for inspection
```

There are no integration/e2e tests. `npm test` covers only the pure calculation/validation modules
(anything under `src/lib/**/*.test.ts`). `integrity-check.mjs` is the closest thing to an
end-to-end check, but it queries live Supabase data, not a CI fixture.

The working tree may contain local-only, gitignored files (`.env.local`, `.env.local.old-payday`,
`.supabase-db-password.txt`, `*-backup.json`, `.payday-old-backup.json`) — leftovers from a
Supabase project migration. Don't read or rely on these when reasoning about the app's config.

## Architecture

### Request flow / auth gate
`src/proxy.ts` is Next 16's renamed `middleware.ts` — same mechanism (matcher-scoped, runs on every
request). It refreshes the Supabase session cookie via `supabase.auth.getUser()` (never
`getSession()` for authorization — see the comment in that file), then redirects: unauthenticated
→ `/login`, `must_change_password` (an `app_metadata` flag) → `/change-password`, and non-admins
away from `/admin/*`. Pages under the `src/app/(app)/` route group are the authenticated app shell
(`(app)/layout.tsx` renders `<Nav>` and re-derives the role); `login` and `change-password` live
outside that group.

### Auth & roles
No `profiles` table — users are Supabase `auth.users` directly, with `role` (`"admin" | "staff"`)
and `must_change_password` stored in `app_metadata`, and display name in `user_metadata`. A
missing/blank role defaults to `"admin"`; this default only ever applies to the seeded bootstrap
admin, since every user created through the app is given an explicit role
(`src/lib/auth-role.ts`'s `roleFromAppMetadata`, mirrored by `public.app_role()` in
`supabase/schema.sql`). `assertAdmin`/`assertAuthenticated`/`requireAdminPage` in that same file are
the app-level guards; RLS enforces the authenticated-vs-not half at the DB layer (see Database
below), but admin-only enforcement (user management, data wipe) exists only in server actions and
in the wipe RPC's `is_admin()` check — not in RLS.

### Supabase clients (three, not interchangeable)
- `src/lib/supabase/client.ts` — browser client (anon key).
- `src/lib/supabase/server.ts` — SSR client for Server Components/Actions; cookie read/write
  through `next/headers`, with a try/catch around `setAll` because Server Components can't set
  cookies (safe to ignore — the proxy refreshes the session on every request anyway).
- `src/lib/supabase/admin.ts` — service-role client (`createAdminClient`). Guarded by a
  `"server-only"` import so bundling it into a client component is a build error. Used only for
  user management, the "delete all data" wipe, and `scripts/seed-admin.mjs` — never for
  general reads/writes.

### Server actions
All mutations live in `src/lib/actions/*.ts` (`"use server"`), one file per domain area
(`employees`, `payroll`, `obligations` (loans/advances), `admin`, `auth`). Common shape: create the
SSR client → `assertAuthenticated`/`assertAdmin` → validate input with a zod schema from
`src/lib/validation/*` → mutate → `logTransaction(...)` (best-effort audit write, see below) →
`revalidatePath(...)`. Actions return discriminated result objects (`{ error }` /
`{ warning }` / `{ ok: true, ... }`) rather than throwing, so forms can render inline messages;
some destructive/ambiguous actions (deactivating an employee with open balances, creating an
overlapping payroll period) take a `confirm` flag and return a `warning` on the first call.

### Payroll computation pipeline
1. **`src/lib/payroll/calculator.ts`** — pure, I/O-free function `computePayroll()`; the single
   source of truth for payroll math, with the business rules spelled out in its header comment
   (food allowance excludes overtime days, sleep allowance is independent of days worked, leave is
   unpaid, statutory government contributions are no longer collected, net pay of exactly ₱0 is a
   normal outcome and only a negative net blocks finalize). Directly unit-tested in
   `calculator.test.ts`.
2. **`src/lib/payroll/build-entry.ts`** — `buildEntryRow()` wraps the calculator for one employee:
   snapshots the employee's current rates (so historical payslips don't change if the profile is
   edited later), caps loan repayments at the loan's balance *and* original principal, caps advance
   allocations at each advance's balance, and shapes the result into the `payroll_entries` row.
   Pure, so it runs identically server-side and could back a client-side live preview.
3. **`src/lib/actions/payroll.ts`** — `savePayrollEntry` persists a draft entry (upsert on
   `(period_id, employee_id)`). `coverShortfallWithAdvance` resolves a negative net pay by issuing
   the employee a new advance for the exact shortfall (or topping up an existing one), zeroing the
   period's net pay; it's idempotent per period (re-invoking tops up rather than duplicating) and
   only targets the *most recent* advance if the 5-advance cap (`MAX_ADVANCES` in
   `validation/obligations.ts`) is already reached. `finalizePeriod`/`reopenPeriod` call the RPCs
   below.
4. **`finalize_payroll_period(p_period_id)`** (Postgres RPC, `SECURITY DEFINER`, in
   `supabase/schema.sql` / `supabase/migrations/`) — the atomic commit point. Re-validates
   `days_worked + days_on_leave` equals the period length and that no entry has negative net pay,
   then decrements every loan/advance balance and writes `payroll_advance_payments` /
   `payroll_loan_payments` history rows, all in one transaction.
5. **`reopen_payroll_period(p_period_id)`** — the inverse, for amendments: reverses every
   loan/advance payment for the period, deletes the payment-history rows, and flips the period back
   to `draft` with `version` incremented and `amended_at` set.

### Money handling
DB money columns are `numeric(12,2)`. The app never does arithmetic in floats/pesos — everything
funnels through integer *centavos* (`src/lib/money.ts`: `toCentavos`/`fromCentavos`/
`multiplyCentavos`/`sumCentavos`/`clampCentavos`) to avoid binary floating-point drift, converting
back to pesos only at the DB write boundary and for display (`formatPHP`/`formatCentavos`).

### Database & migrations
`supabase/schema.sql` is a from-scratch, idempotent bootstrap (safe to re-run — `if not exists` /
`create or replace` / drop-then-recreate throughout) but its own trailing comment says the
**migrations in `supabase/migrations/` are canonical** for anything added after the initial cut;
schema.sql is kept as a convenience for seeding a brand-new database. When changing schema, add a
new timestamped file under `supabase/migrations/` (see the existing ones for the pattern) rather
than only editing `schema.sql`.

RLS on every domain table is a single blanket policy — any authenticated user (admin or staff) can
read/write (`*_authenticated_all`, `using (public.is_authenticated())`). There is no per-row
ownership model. Integrity is instead enforced by a mix of:
- DB `CHECK` constraints (non-negative money/day columns, `sleep_days`/`overtime_days` ≤
  `days_worked`);
- triggers for cross-row/cross-table rules a plain `CHECK` can't express
  (`enforce_max_active_advances` caps an employee at 5 active advances;
  `enforce_loan_payment_caps` blocks a repayment exceeding a loan's balance or original principal);
- app-level clamping in `build-entry.ts` (the DB layer is defense-in-depth, not the primary
  gate — the app should never rely on a trigger exception as its main validation path);
- `scripts/integrity-check.mjs`, a standalone reconciliation pass over live data (entry arithmetic,
  balances never negative, payment-history `balance_after` matches current balances, no payment
  history on non-finalized periods).

### Audit log
`src/lib/transaction-log.ts`'s `logTransaction()` writes to the `transaction_logs` table
(action/entity/entity_id/summary/details/actor). Called from every mutating server action. It
swallows its own errors — a logging failure must never break the underlying mutation. Rendered at
`/admin/logs`.

### PDF generation
`src/lib/pdf/payslip-document.tsx` (`@react-pdf/renderer`) renders one page per employee plus a
company summary page. `@react-pdf/renderer` is listed in `serverExternalPackages` in
`next.config.ts` so Turbopack/webpack don't try to bundle its native-ish deps — it's `require`d at
runtime by the route handler at `src/app/(app)/payroll/[id]/pdf/route.ts`. For local inspection
outside the app, `scripts/render-pdf.mts` renders directly to a file.

### Types
`src/lib/types.ts` hand-mirrors the `payroll_entries`/`employees`/`advances`/`loans`/
`payroll_periods` row shapes from `supabase/schema.sql` — there's no generated-types step. Keep
this file in sync manually when the schema changes.

### UI
shadcn/ui components (`components.json`: `base-nova` style, `base-ui/react` primitives, neutral
base color) live in `src/components/ui`; feature components are grouped by domain under
`src/components/{employees,payroll,admin,reports}`. Forms use `react-hook-form` +
`@hookform/resolvers/zod` against the same zod schemas the server actions validate with. Toasts via
`sonner`, charts (Reports) via `recharts`, dark mode via `next-themes`.
