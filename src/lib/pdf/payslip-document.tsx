import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Employee, PayrollEntry, PayrollPeriod } from "@/lib/types";
import { fullName } from "@/lib/types";
import { formatPeriod } from "@/lib/payroll/period";

// Helvetica (the PDF base font) has no ₱ glyph, so payslips print "PHP".
function peso(n: number): string {
  return "PHP " + (n ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Helvetica renders the en-dash as a blank; use a plain hyphen on payslips.
function dateRange(period: PayrollPeriod): string {
  return formatPeriod(period.period_start, period.period_end).replace(/–/g, "-");
}

export type PayslipRow = { entry: PayrollEntry; employee: Employee };

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1e1b2e", fontFamily: "Helvetica" },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#6d4bd8" },
  docType: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: "#6b7280" },
  period: { fontSize: 10, color: "#6b7280", marginBottom: 16 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e5e1f0", marginVertical: 10 },
  empName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  empMeta: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#6d4bd8", marginBottom: 6, marginTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  label: { color: "#374151" },
  value: { fontFamily: "Helvetica" },
  columns: { flexDirection: "row", gap: 24 },
  col: { flex: 1 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, marginTop: 4, borderTopWidth: 1, borderTopColor: "#e5e1f0" },
  totalLabel: { fontFamily: "Helvetica-Bold" },
  netBox: { marginTop: 16, backgroundColor: "#efeafc", borderRadius: 8, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  netLabel: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  netValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#6d4bd8" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#9ca3af", textAlign: "center" },
  // Summary
  sumHead: { flexDirection: "row", backgroundColor: "#efeafc", paddingVertical: 6, paddingHorizontal: 8, fontFamily: "Helvetica-Bold" },
  sumRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#eee" },
  sumName: { flex: 1 },
  sumDays: { width: 70, textAlign: "right" },
  sumNet: { width: 90, textAlign: "right" },
  grand: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: "#6d4bd8" },
});

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Payslip({ entry, employee, period }: PayslipRow & { period: PayrollPeriod }) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>PayDay</Text>
        <Text style={styles.docType}>PAYSLIP</Text>
      </View>
      <Text style={styles.period}>Pay period: {dateRange(period)}</Text>

      <Text style={styles.empName}>{fullName(employee)}</Text>
      <Text style={styles.empMeta}>
        {employee.nickname ? `"${employee.nickname}"  ·  ` : ""}
        SSS {employee.sss_number ?? "—"}  ·  PhilHealth {employee.philhealth_number ?? "—"}  ·  Pag-IBIG{" "}
        {employee.pagibig_number ?? "—"}
      </Text>

      <View style={styles.rule} />

      <View style={styles.columns}>
        {/* Earnings */}
        <View style={styles.col}>
          <Text style={styles.sectionTitle}>EARNINGS</Text>
          <Line label={`Basic pay (${entry.days_worked} days × ${peso(entry.daily_wage)})`} value={peso(entry.weekly_salary - entry.total_food_allowance - entry.total_sleep_allowance)} />
          <Line label="Food allowance" value={peso(entry.total_food_allowance)} />
          <Line label="Sleep allowance" value={peso(entry.total_sleep_allowance)} />
          <Line label={`Overtime (${entry.overtime_days} days × ${peso(entry.overtime_fee)})`} value={peso(entry.overtime_amount)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Gross weekly pay</Text>
            <Text style={styles.totalLabel}>{peso(entry.gross_weekly_salary)}</Text>
          </View>
        </View>

        {/* Deductions */}
        <View style={styles.col}>
          <Text style={styles.sectionTitle}>DEDUCTIONS</Text>
          <Line label="SSS contribution" value={peso(entry.sss_contribution)} />
          <Line label="Pag-IBIG contribution" value={peso(entry.pagibig_contribution)} />
          <Line label="PhilHealth contribution" value={peso(entry.philhealth_contribution)} />
          <Line label="SSS loan" value={peso(entry.sss_loan_payment)} />
          <Line label="Pag-IBIG loan" value={peso(entry.pagibig_loan_payment)} />
          <Line label="Advances" value={peso(entry.total_advance_deduction)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total deductions</Text>
            <Text style={styles.totalLabel}>{peso(entry.total_deductions)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.netBox}>
        <Text style={styles.netLabel}>NET WEEKLY PAY</Text>
        <Text style={styles.netValue}>{peso(entry.net_weekly_pay)}</Text>
      </View>

      <Text style={styles.footer}>
        {fullName(employee)} · {dateRange(period)} · Days on leave:{" "}
        {entry.days_on_leave} · Generated by PayDay on {new Date().toLocaleDateString("en-PH")}
      </Text>
    </Page>
  );
}

export function PayslipDocument({ period, rows }: { period: PayrollPeriod; rows: PayslipRow[] }) {
  const sorted = [...rows].sort((a, b) =>
    fullName(a.employee).localeCompare(fullName(b.employee))
  );
  const grandTotal = sorted.reduce((s, r) => s + r.entry.net_weekly_pay, 0);

  return (
    <Document title={`Payroll ${period.period_start} to ${period.period_end}`}>
      {sorted.map((r) => (
        <Payslip key={r.entry.id} entry={r.entry} employee={r.employee} period={period} />
      ))}

      {/* Summary page */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>PayDay</Text>
          <Text style={styles.docType}>PAYROLL SUMMARY</Text>
        </View>
        <Text style={styles.period}>
          {dateRange(period)}
          {period.note ? ` · ${period.note}` : ""}
        </Text>

        <View style={styles.sumHead}>
          <Text style={styles.sumName}>Employee</Text>
          <Text style={styles.sumDays}>Days</Text>
          <Text style={styles.sumNet}>Net pay</Text>
        </View>
        {sorted.map((r) => (
          <View key={r.entry.id} style={styles.sumRow}>
            <Text style={styles.sumName}>{fullName(r.employee)}</Text>
            <Text style={styles.sumDays}>{r.entry.days_worked}</Text>
            <Text style={styles.sumNet}>{peso(r.entry.net_weekly_pay)}</Text>
          </View>
        ))}
        <View style={styles.grand}>
          <Text style={[styles.sumName, { fontFamily: "Helvetica-Bold" }]}>
            TOTAL ({sorted.length} employees)
          </Text>
          <Text style={[styles.sumNet, { fontFamily: "Helvetica-Bold", color: "#6d4bd8" }]}>
            {peso(grandTotal)}
          </Text>
        </View>

        <Text style={styles.footer}>Generated by PayDay on {new Date().toLocaleString("en-PH")}</Text>
      </Page>
    </Document>
  );
}
