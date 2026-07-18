import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { PayslipDocument, type PayslipRow } from "@/lib/pdf/payslip-document";
import type { Employee, PayrollEntry, PayrollPeriod } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!period) return new Response("Payroll period not found", { status: 404 });

  // Embed the employee for each entry (payroll_entries.employee_id → employees).
  const { data: entries, error } = await supabase
    .from("payroll_entries")
    .select("*, employees(*)")
    .eq("period_id", id);
  if (error) return new Response(error.message, { status: 500 });

  const rows: PayslipRow[] = (entries ?? [])
    .filter((e) => e.employees)
    .map((e) => {
      const { employees, ...entry } = e as PayrollEntry & { employees: Employee };
      return { entry: entry as PayrollEntry, employee: employees as Employee };
    });

  if (rows.length === 0) {
    return new Response("No payroll entries to print for this period.", { status: 404 });
  }

  // PayslipDocument returns a <Document>; cast past renderToBuffer's strict
  // ReactElement<DocumentProps> param (it renders the component fine at runtime).
  const element = createElement(PayslipDocument, {
    period: period as PayrollPeriod,
    rows,
  }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(element);

  const filename = `payroll-${period.period_start}_to_${period.period_end}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
