// Dump all domain tables (and an auth-user summary) to a JSON file so data can
// be restored into another Supabase project.
//   node --env-file=.env.local scripts/backup-data.mjs <outPath>
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outPath = process.argv[2] ?? "backup.json";

const c = createClient(url, key, { auth: { persistSession: false } });

// Order matters for restore (parents before children).
const tables = [
  "employees",
  "advances",
  "loans",
  "payroll_periods",
  "payroll_entries",
  "payroll_advance_payments",
  "payroll_loan_payments",
];

const dump = { _source: url, _at: new Date().toISOString() };
for (const t of tables) {
  const { data, error } = await c.from(t).select("*");
  if (error) {
    console.error(`Failed to read ${t}:`, error.message);
    process.exit(1);
  }
  dump[t] = data;
}

const { data: users } = await c.auth.admin.listUsers({ perPage: 1000 });
dump._auth_users = (users?.users ?? []).map((u) => ({
  id: u.id,
  email: u.email,
  app_metadata: u.app_metadata,
  user_metadata: u.user_metadata,
}));

writeFileSync(outPath, JSON.stringify(dump, null, 2));
console.log(
  "Backed up:",
  JSON.stringify(Object.fromEntries(tables.map((t) => [t, dump[t].length]))),
  `+ ${dump._auth_users.length} auth users → ${outPath}`
);
