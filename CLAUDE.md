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
balances), and generate payslip PDFs. Employees can be assigned to a department; every screen that
lists employees — the employee list, payroll roster, Reports period view, Prev/Next stepper, and
the payslip PDF (including its company summary page, which subtotals per department) — is
grouped/ordered by department. Staff can also enter a weekly **expense report** alongside each
payroll run — line items grouped by an admin-managed expense type, rolled up with that week's
payroll total into a grand total — with the same draft/finalize/amend lifecycle and its own PDF (see
"Expense reports" below). The UI/app title is "MMG HR and Payroll System";
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
npm run seed:admin   # create the bootstrap admin (reads .env.local); refuses to touch an
                      #   existing account unless run with --force (or FORCE_RESEED=1)
```

Ad-hoc ops scripts — all read Supabase credentials from `.env.local` via `--env-file` and operate
on whatever project that file points at:

```bash
node --env-file=.env.local scripts/integrity-check.mjs                     # reconcile payroll math & balances against live data
node --env-file=.env.local scripts/backup-data.mjs [outPath]               # dump all domain tables + auth users to JSON
node --env-file=.env.local scripts/restore-data.mjs <backupPath>           # restore a JSON backup into the current project
npx tsx --env-file=.env.local scripts/render-pdf.mts <periodId> <outPath>  # render one period's payslip PDF to a file, for inspection
npx tsx --env-file=.env.local scripts/render-expense-pdf.mts <expensePeriodId> <outPath>  # same, for an expense report
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
(`employees`, `payroll`, `obligations` (loans/advances), `departments`, `admin`, `auth`). Common
shape: create the SSR client → `assertAuthenticated`/`assertAdmin` → validate input with a zod
schema from `src/lib/validation/*` → mutate → `logTransaction(...)` (best-effort audit write) →
`revalidatePath(...)`. Actions return discriminated result objects (`{ error }` /
`{ warning }` / `{ ok: true, ... }`) rather than throwing, so forms can render inline messages;
some destructive/ambiguous actions (deactivating an employee with open balances, creating an
overlapping payroll period) take a `confirm` flag and return a `warning` on the first call.

### Payroll computation pipeline
1. **`src/lib/payroll/calculator.ts`** — pure, I/O-free function `computePayroll()`; the single
   source of truth for payroll math, with the business rules spelled out in its header comment
   (food allowance excludes overtime days, sleep allowance is independent of days worked *and may
   exceed it* — unlike overtime days, which is capped at days worked — leave is unpaid, statutory
   government contributions are no longer collected, net pay of exactly ₱0 is a normal outcome and
   only a negative net blocks finalize). Directly unit-tested in `calculator.test.ts`.
2. **`src/lib/payroll/build-entry.ts`** — `buildEntryRow()` wraps the calculator for one employee:
   snapshots the employee's current rates (so historical payslips don't change if the profile is
   edited later), caps loan repayments at the loan's balance *and* original principal, caps advance
   allocations at each advance's balance, and shapes the result into the `payroll_entries` row.
   Pure, so it runs identically server-side and could back a client-side live preview.
3. **`src/lib/actions/payroll.ts`** — `savePayrollEntry` persists a draft entry (upsert on
   `(period_id, employee_id)`) and takes a 4th `notes` argument: if it differs from the employee's
   current `notes`, the same call also updates `employees.notes` and logs a separate audit entry
   (only when it actually changed, so routine saves don't spam the log) — one Save button in the
   compute-form UI, two writes/log entries when notes changed. `coverShortfallWithAdvance` resolves
   a negative net pay by issuing the employee a new advance for the exact shortfall (or topping up
   an existing one), zeroing the period's net pay; it's idempotent per period (re-invoking tops up
   rather than duplicating) and only targets the *most recent* advance if the 5-advance cap
   (`MAX_ADVANCES` in `validation/obligations.ts`) is already reached. `finalizePeriod`/
   `reopenPeriod` call the RPCs below.
4. **`finalize_payroll_period(p_period_id)`** (Postgres RPC, `SECURITY DEFINER`, in
   `supabase/schema.sql` / `supabase/migrations/`) — the atomic commit point. Re-validates
   `days_worked + days_on_leave` equals the period length and that no entry has negative net pay,
   then decrements every loan/advance balance and writes `payroll_advance_payments` /
   `payroll_loan_payments` history rows, all in one transaction.
5. **`reopen_payroll_period(p_period_id)`** — the inverse, for amendments: reverses every
   loan/advance payment for the period, deletes the payment-history rows, and flips the period back
   to `draft` with `version` incremented and `amended_at` set.

### Departments
`departments` (id, name, `sort_order`) is a small admin-managed table — create/rename/reorder/
delete at `/admin/departments` (`src/components/admin/department-management.tsx`,
`src/lib/actions/departments.ts`; reorder swaps `sort_order` between adjacent rows via two
sequential updates, deliberately with no unique constraint on that column so the swap can't
transiently collide). `employees.department_id` is a nullable FK (`on delete set null` — deleting a
department never deletes employees, just unassigns them; the delete action warns first if any are
still assigned). `src/lib/departments.ts` exports `sortEmployeesByDepartment`/`groupByDepartment`
(order: department `sort_order`, then employee last name; unassigned employees sort last) — the
single source of truth for department ordering, reused by every screen that lists employees: the
employee list (`employee-list.tsx`), the payroll roster (`payroll/[id]/page.tsx`) and Prev/Next
stepper (`payroll/[id]/[employeeId]/page.tsx`), the Reports period view
(`reports/period/[id]/page.tsx`), and the payslip PDF (`payslip-document.tsx`). The roster and
Reports period view previously only *sorted* by department (no section headers); they now group
with headers too, same as the employee list. `groupByDepartment` result types don't carry
`department_id`/`last_name` at the top level for rows shaped like `{ entry, employee }` (payroll
entries, payslip rows) — callers lift those two fields onto the row before grouping (see
`toSortable` in `payslip-document.tsx` for the pattern) since the grouping/sorting functions require
them there. Department section headers are the shared `DepartmentGroupHeading` component
(`src/components/department-group-heading.tsx`, not `src/components/employees/`, since payroll and
reports pages use it too) — deliberately `text-lg`, not `text-sm`, so a group name reads clearly
larger than the row content beneath it; change it there once rather than per-page.

The dashboard's "Active advances"/"Open loans" stat tiles link to `/employees?filter=advances` /
`?filter=loans`, which narrows `EmployeeList` to just the affected employees (still department-
grouped, empty groups hidden) and swaps the nickname column for each employee's balance. Note the
loan tile's count is loan *records*, not people — one employee can hold both an SSS and a Pag-IBIG
loan, so "3 open loans" can resolve to fewer than 3 people.

### Expense reports
An expense report (`expense_periods`) is created **independently of any payroll run** — its own
Start/End/Note dialog (`new-expense-report-dialog.tsx`, a near-exact copy of payroll's
`new-period-dialog.tsx`, right down to reusing `analyzeNewPeriod` for the overlap/skipped-days
warning and `unique (period_start, period_end)` for exact-duplicate rejection). It mirrors the
payroll period lifecycle (draft → save → finalize, amend-to-reopen) but with **no RPC for
finalize/reopen** — unlike payroll, an expense report has no balance side-effects, so a single
`UPDATE` is already atomic. Line items (`expense_items`) are grouped by an admin-managed
`expense_categories` lookup table (mirrors `departments`: name, `sort_order`, reorder via a
two-row swap), seeded with four types (Mau Expenses, Mau GCash/Transfer, Hardware Expenses,
Miscellaneous Expenses — the last with seeded `default_descriptions`). Managed at
`/admin/expense-types` (`src/components/admin/expense-type-management.tsx`,
`src/lib/actions/expense-categories.ts`). Deleting a type that has items on any report **archives**
it (`is_active = false`) instead of hard-deleting, since `expense_items.category_id` is `on delete
restrict` and past items are financial records — archived types disappear from new reports but
still render on the reports that reference them (both the editor and the PDF filter categories as
`is_active OR has items on this report`, duplicated in each entry point the same way the payslip
PDF/route pair already duplicates its data-shaping).

**Payroll total: link a finalized run, or type an amount (2026-08-01).** A report can't be
finalized until one of these is set — enforced as a hard error in `finalizeExpenseReport`, not a
warn-and-proceed like payroll's own gates:
- **Link a finalized payroll run** — `payroll_period_id` (now nullable; a partial unique index
  `where payroll_period_id is not null` still caps it at one expense report per linked run, same
  as the old plain-unique constraint did). Only *finalized* runs are offered in the picker and
  `updateExpensePayrollLink` re-validates that server-side, so once linked the total is guaranteed
  live-correct going forward — it's re-read from `payroll_entries` on every render, even after this
  report is finalized, so amending that payroll run later still moves this report's grand total and
  reprinted PDF (matches how the payslip "Remaining balance" lines already behave). A linked run
  still can't be deleted out from under its report: `deletePeriod()` in `src/lib/actions/payroll.ts`
  pre-checks `expense_periods.payroll_period_id` and returns a friendly error rather than letting
  the `on delete restrict` FK fire raw.
- **Type an amount manually** — `payroll_total_override`, for a week payroll wasn't run for in this
  system. Frozen; nothing re-reads it.

The two are mutually exclusive: `updateExpensePayrollLink` always nulls out the other column
server-side regardless of what the client sent, so storage can never have both set. `src/lib/expenses/totals.ts`'s `resolvePayrollTotalCentavos(period, netTotalByPayrollPeriodCentavos)`
is the one pure function every read path (the editor's live preview, the PDF route, the dev PDF
script, the `/expenses` and `/reports` list pages) calls to pick the right source — never inline
`payroll_period_id ? ... : ...` duplicated per call site. In the editor
(`expense-report-form.tsx`) both fields live in the same react-hook-form instance as the line
items, so one "Save draft" click calls `updateExpensePayrollLink` then `saveExpenseReport`
sequentially — still a single save button from the user's perspective.

**Bug fixed same-day (2026-08-01):** the initial migration gave `expense_periods` a
`before update` `set_updated_at` trigger but no `updated_at` column, so every `UPDATE` on the table
(finalize, reopen) failed with `record "new" has no field "updated_at"` — caught during live-browser
verification by checking the DB row directly after a Finalize click. Fixed by migration
`20260801010000_fix_expense_periods_updated_at.sql`; `expense_items` and `expense_categories` both
already had the column, only `expense_periods` was missing it.

Blank rows (no description, no date, ₱0) are never persisted — `src/lib/expenses/totals.ts`'s
`isBlankItem`/`padToMinRows` are the pure, unit-tested source of truth for this: `saveExpenseReport`
filters them out before calling the `save_expense_items` RPC (delete-and-reinsert for the whole
report, in one transaction), and the editor (`expense-report-form.tsx`) re-pads every category back
up to `MIN_ROWS` (10) visible rows from whatever was actually saved. A new report's rows are seeded
by `carryForwardDescriptions`: the nearest **earlier** report's (by `period_start`, not creation
order) non-blank descriptions per category, dates/amounts always starting blank — or the category's
own `default_descriptions` when there's no earlier report to draw from (a brand-new category, or the
very first expense report). `expenseTotals()` (also in `totals.ts`) is the shared pure function
behind both the live client-side preview (`expense-report-form.tsx`, watching the whole form the
same way `compute-form.tsx` watches its payroll inputs) and the PDF.

**Per-item PDF pages (2026-08-01).** `expense_categories.per_item_pdf_pages` (admin-editable
checkbox in `expense-type-management.tsx`, seeded `true` only for Miscellaneous Expenses — a normal
data-driven flag, not a category name hardcoded into the PDF renderer) makes
`expense-report-document.tsx` emit one additional full page per line item for that category, after
the normal summary table (the table still prints too — this is additive, not a replacement). Each
page repeats the brand/period/status header and shows Date/Description/Amount at a larger size,
because a page like this may be printed or handed out on its own rather than read in the sequence
of the rest of the report. Implemented with react-pdf's `<View break>` (forces a new physical page
regardless of where it falls in the auto-flowing `<Page>`), one `View` per item in a
`.flatMap()` over categories filtered to `per_item_pdf_pages`. **Zero-amount items are skipped**
(filtered to `item.amount > 0` before paging, per-category) — the summary table still shows every
row including blank padding ones, but a padding row with nothing entered never gets its own page,
and "Item X of Y" numbering reflects only the priced items, not the raw row count.

### Advances & loans
`src/lib/actions/obligations.ts`: loans (SSS/Pag-IBIG) are upserted per employee+type
(`saveLoan`); advances are freeform records (label, `total_advance`, `current_balance`, up to
`MAX_ADVANCES` = 5 active per employee, enforced both proactively in `createAdvance`/`updateAdvance`
and by the `enforce_max_active_advances` DB trigger as defense-in-depth).

`payroll_advance_payments` rows are normally written only by `finalize_payroll_period` (one row per
advance actually deducted that period). `updateAdvance` can *also* write one: editing
`current_balance` directly on an advance that already has payment history warns first (returns
`{warning}`, needs a `confirm=true` resubmit — same pattern as `createPeriod`'s overlap warning),
then on confirm writes a reconciling row with `payroll_entry_id = null` (marking it a manual
adjustment, not a payroll-driven deduction; `amount` is the signed delta, `balance_after` the new
balance, `note` free text). This exists because the two are otherwise read from different places —
the Employee Report's "Advances balance" card reads `advances.current_balance` live, while its
"Advance Payment History" card reads each payment's immutable `balance_after` snapshot — and a
balance edited without this would leave the two silently disagreeing (this looked like a
payroll double-deduction bug once; it wasn't one — see `20260731120000_advance_balance_adjustments.sql`
for the fix and the reasoning). The Employee Report queries `payroll_advance_payments` by
`advance_id` directly (not through an inner join on `payroll_entries`) so these null-entry rows
still surface, rendered as "Manual adjustment" in place of a period. **The identical gap still
exists for loans** (`payroll_loan_payments`/`updateLoan` has no equivalent reconciliation) — not
fixed, out of scope so far.

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

RLS on every domain table (including `departments` and the expense-report tables) is a single
blanket policy — any authenticated
user (admin or staff) can read/write (`*_authenticated_all`, `using (public.is_authenticated())`).
There is no per-row ownership model. Integrity is instead enforced by a mix of:
- DB `CHECK` constraints (non-negative money/day columns, `overtime_days` ≤ `days_worked` —
  `sleep_days` has no such constraint; it's independent of `days_worked` and may exceed it);
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
outside the app, `scripts/render-pdf.mts` renders directly to a file. Both entry points fetch the
same extra data and must stay in sync if `PayslipRow` changes.

`src/lib/pdf/format.ts` holds `peso()`/`dateRange()` — shared by both PDF documents (Helvetica has
no `₱` glyph, so PDFs print "PHP"; Helvetica also renders the en-dash as a blank, so PDFs use a
plain hyphen instead of `formatPeriod`'s "–"). `src/lib/pdf/expense-report-document.tsx` is the
expense-report analogue of `payslip-document.tsx`: one page with the Total Expenses summary
followed by one table per expense type, rendered by `src/app/(app)/expenses/[id]/pdf/route.ts` (same
shape as the payroll PDF route) and, for local inspection, `scripts/render-expense-pdf.mts`.

Each employee's SSS loan / Pag-IBIG loan / Advances deduction lines also show a "Remaining balance"
— `PayslipRow`'s `sssLoanBalance`/`pagibigLoanBalance`/`advancesBalance`, computed by both entry
points from `loans`/`advances` current state. This is deliberately the **live** balance, not a
finalize-time snapshot (unlike the rate-snapshotting elsewhere in this pipeline) — a reprinted
payslip shows current standing, matching the Employee Report's balance cards, not what the balance
was at finalize time. The summary page groups rows by department with a subtotal per department
(via `groupByDepartment`, same as the roster/Reports), plus the original grand total.

**Hardcoded zero-net exclusion for two employees (2026-08-01).**
`src/lib/payroll/report-exclusions.ts` exports `hideFromZeroNetReports(employeeId, netWeeklyPay)` —
an explicit, acknowledged one-off, not a general rule — keyed by two real employee ids. When one of
those two has exactly ₱0 net pay for a period, they're dropped from that period's payslip page, the
payslip PDF's summary page (`PayslipDocument` filters once up front so `sorted`/`groups`/
`grandTotal` all inherit it), and the equivalent web view, the Reports per-period page
(`reports/period/[id]/page.tsx`). Deliberately **not** applied to the payroll roster/compute page
(staff still need to see and pay every employee there) or to an employee's own payslip-history table
on their profile page.

### Types
`src/lib/types.ts` hand-mirrors the `payroll_entries`/`employees`/`advances`/`loans`/
`payroll_periods`/`departments`/`expense_categories`/`expense_periods`/`expense_items` row shapes
from `supabase/schema.sql` — there's no generated-types step. Keep this file in sync manually when
the schema changes.

### UI
shadcn/ui components (`components.json`: `base-nova` style, `base-ui/react` primitives, neutral
base color) live in `src/components/ui`; feature components are grouped by domain under
`src/components/{employees,payroll,admin,reports}`. Forms use `react-hook-form` +
`@hookform/resolvers/zod` against the same zod schemas the server actions validate with. Toasts via
`sonner`, charts (Reports) via `recharts`, dark mode via `next-themes`.

A form whose leave-guard checks react-hook-form's `isDirty` must call `reset(values)` right after
every successful save. `isDirty` compares live values against the `defaultValues` captured at
mount; `router.refresh()` re-fetches server data but doesn't remount the client form, so without
`reset()`, `isDirty` stays stuck `true` forever after the *first* save, and the leave-guard fires
even with nothing unsaved (this was a real bug in `employee-form.tsx`, fixed 2026-07-31).
`compute-form.tsx` sidesteps this differently — it tracks its own saved-state signature
(`savedSigRef`) rather than relying on `isDirty` at all.

**Attendance fields, locked vs. independent (2026-08-01).** In `compute-form.tsx`, "Days on leave"
is always disabled — never hand-editable, even in a draft — though it's still auto-computed as
`expectedDays − days_worked` via `setValue` whenever days worked changes. It's rendered with a plain
HTML `disabled` attribute, not react-hook-form's `disabled` register option: that option excludes
the field's value from RHF's tracked form state entirely, which would've made every save zero it
out. "Sleep days" has the opposite property — no auto-fill relationship to days worked at all (an
older convenience that copied days-worked into sleep-days until first touched was removed); it only
ever changes when the user types into it directly.
