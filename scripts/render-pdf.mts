// Dev-only: render a finalized period's payslip PDF to a file for inspection.
//   npx tsx --env-file=.env.local scripts/render-pdf.mts <periodId> <outPath>
import { renderToFile } from "@react-pdf/renderer";
import { createElement } from "react";
import { createClient } from "@supabase/supabase-js";
import { PayslipDocument } from "../src/lib/pdf/payslip-document";

const periodId = process.argv[2];
const outPath = process.argv[3] ?? "/tmp/payslip.pdf";

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const { data: period } = await c
  .from("payroll_periods")
  .select("*")
  .eq("id", periodId)
  .maybeSingle();
const { data: entries } = await c
  .from("payroll_entries")
  .select("*, employees(*)")
  .eq("period_id", periodId);

const rows = (entries ?? []).map((e: any) => {
  const { employees, ...entry } = e;
  return { entry, employee: employees };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
await renderToFile(createElement(PayslipDocument, { period, rows }) as any, outPath);
console.log(`wrote ${outPath} (${rows.length} payslips + summary)`);
