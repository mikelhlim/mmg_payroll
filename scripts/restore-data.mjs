// Restore domain tables from a backup JSON into the CURRENT project (env).
//   node --env-file=.env.local scripts/restore-data.mjs <backupPath>
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const path = process.argv[2] ?? "backup.json";

const c = createClient(url, key, { auth: { persistSession: false } });
const dump = JSON.parse(readFileSync(path, "utf8"));

// Parents before children (FK order).
const tables = [
  "employees",
  "advances",
  "loans",
  "payroll_periods",
  "payroll_entries",
  "payroll_advance_payments",
  "payroll_loan_payments",
];

console.log(`Restoring into ${url}`);
for (const t of tables) {
  const rows = dump[t] ?? [];
  if (!rows.length) {
    console.log(`  ${t}: 0 (skipped)`);
    continue;
  }
  const { error } = await c.from(t).insert(rows);
  if (error) {
    console.error(`  ${t}: ERROR ${error.message}`);
    process.exit(1);
  }
  console.log(`  ${t}: ${rows.length} restored`);
}
console.log("Restore complete.");
