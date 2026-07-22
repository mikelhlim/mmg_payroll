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
  page: { padding: 28, fontSize: 8, color: "#1e1b2e", fontFamily: "Helvetica" },
  half: { flex: 1, paddingVertical: 4 },
  cutLine: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#c9c3dd",
    borderBottomStyle: "dashed",
  },
  cutLabel: {
    fontSize: 6,
    color: "#9ca3af",
    marginHorizontal: 6,
    letterSpacing: 1,
  },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  brand: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#6d4bd8" },
  docType: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: "#6b7280" },
  period: { fontSize: 7, color: "#6b7280", marginBottom: 6 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e5e1f0", marginVertical: 5 },
  empName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  empMeta: { fontSize: 6.5, color: "#6b7280", marginTop: 1 },
  sectionTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#6d4bd8", marginBottom: 3, marginTop: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  label: { color: "#374151" },
  value: { fontFamily: "Helvetica" },
  formula: { fontSize: 5.5, color: "#9ca3af", marginTop: -0.5, marginBottom: 1 },
  columns: { flexDirection: "row", gap: 16 },
  col: { flex: 1 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5, marginTop: 2, borderTopWidth: 1, borderTopColor: "#e5e1f0" },
  totalLabel: { fontFamily: "Helvetica-Bold" },
  netBox: { marginTop: 7, backgroundColor: "#efeafc", borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  netLabel: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  netValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#6d4bd8" },
  halfFooter: { fontSize: 5.5, color: "#9ca3af", textAlign: "center", marginTop: 3 },
  // Summary
  sumHead: { flexDirection: "row", backgroundColor: "#efeafc", paddingVertical: 6, paddingHorizontal: 8, fontFamily: "Helvetica-Bold" },
  sumRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#eee" },
  sumName: { flex: 1 },
  sumDays: { width: 70, textAlign: "right" },
  sumNet: { width: 90, textAlign: "right" },
  grand: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: "#6d4bd8" },
  footer: { position: "absolute", bottom: 20, left: 28, right: 28, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

function Line({
  label,
  value,
  formula,
}: {
  label: string;
  value: string;
  formula?: string;
}) {
  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      {formula && <Text style={styles.formula}>{formula}</Text>}
    </View>
  );
}

/** One self-contained payslip — rendered twice per page (see Payslip below). */
function PayslipHalf({ entry, employee, period, copyLabel }: PayslipRow & { period: PayrollPeriod; copyLabel: string }) {
  const foodDays = Math.max(0, entry.days_worked - entry.overtime_days);
  const baseWage = entry.weekly_salary - entry.total_food_allowance - entry.total_sleep_allowance;
  const hasContributions =
    entry.sss_contribution > 0 || entry.pagibig_contribution > 0 || entry.philhealth_contribution > 0;

  return (
    <View style={styles.half}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>MMG HR &amp; Payroll</Text>
        <Text style={styles.docType}>PAYSLIP · {copyLabel}</Text>
      </View>
      <Text style={styles.period}>Pay period: {dateRange(period)}</Text>

      <Text style={styles.empName}>{fullName(employee)}</Text>
      <Text style={styles.empMeta}>
        {employee.nickname ? `"${employee.nickname}"  ·  ` : ""}
        SSS {employee.sss_number ?? "N/A"}  ·  PhilHealth {employee.philhealth_number ?? "N/A"}  ·  Pag-IBIG{" "}
        {employee.pagibig_number ?? "N/A"}
      </Text>

      <View style={styles.rule} />

      <View style={styles.columns}>
        {/* Earnings */}
        <View style={styles.col}>
          <Text style={styles.sectionTitle}>EARNINGS</Text>
          <Line
            label="Basic pay"
            formula={`${entry.days_worked} days × ${peso(entry.daily_wage)}`}
            value={peso(baseWage)}
          />
          <Line
            label="Food allowance"
            formula={`(${entry.days_worked} - ${entry.overtime_days} OT) = ${foodDays} × ${peso(entry.food_allowance_per_day)}`}
            value={peso(entry.total_food_allowance)}
          />
          <Line
            label="Sleep allowance"
            formula={`${entry.sleep_days} sleep days × ${peso(entry.sleep_allowance_per_day)}`}
            value={peso(entry.total_sleep_allowance)}
          />
          <Line
            label="Overtime"
            formula={`${entry.overtime_days} days × ${peso(entry.overtime_fee)}`}
            value={peso(entry.overtime_amount)}
          />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Gross weekly pay</Text>
            <Text style={styles.totalLabel}>{peso(entry.gross_weekly_salary)}</Text>
          </View>
        </View>

        {/* Deductions */}
        <View style={styles.col}>
          <Text style={styles.sectionTitle}>DEDUCTIONS</Text>
          {hasContributions && (
            <>
              {entry.sss_contribution > 0 && (
                <Line label="SSS contribution" value={peso(entry.sss_contribution)} />
              )}
              {entry.pagibig_contribution > 0 && (
                <Line label="Pag-IBIG contribution" value={peso(entry.pagibig_contribution)} />
              )}
              {entry.philhealth_contribution > 0 && (
                <Line label="PhilHealth contribution" value={peso(entry.philhealth_contribution)} />
              )}
            </>
          )}
          <Line label="SSS loan" value={peso(entry.sss_loan_payment)} />
          <Line label="Pag-IBIG loan" value={peso(entry.pagibig_loan_payment)} />
          <Line label="Advances" value={peso(entry.total_advance_deduction)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total deductions</Text>
            <Text style={styles.totalLabel}>{peso(entry.total_deductions)}</Text>
          </View>
        </View>
      </View>

      {entry.shortfall_covered > 0 && (
        <Line label="Advance due to Shortfall" value={`+ ${peso(entry.shortfall_covered)}`} />
      )}

      <View style={styles.netBox}>
        <Text style={styles.netLabel}>NET WEEKLY PAY</Text>
        <Text style={styles.netValue}>{peso(entry.net_weekly_pay)}</Text>
      </View>

      <Text style={styles.halfFooter}>
        {fullName(employee)} · {dateRange(period)} · Days on leave: {entry.days_on_leave}
      </Text>
    </View>
  );
}

function Payslip({ entry, employee, period }: PayslipRow & { period: PayrollPeriod }) {
  return (
    <Page size="A4" style={styles.page}>
      <PayslipHalf entry={entry} employee={employee} period={period} copyLabel="EMPLOYEE COPY" />
      <View style={styles.cutLine}>
        <Text style={styles.cutLabel}>- - - - - - - - - - - - - - CUT HERE - - - - - - - - - - - - - -</Text>
      </View>
      <PayslipHalf entry={entry} employee={employee} period={period} copyLabel="COMPANY COPY" />

      <Text style={styles.footer} render={({ pageNumber }) => `Page ${pageNumber} · Generated by MMG HR & Payroll on ${new Date().toLocaleDateString("en-PH")}`} fixed />
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
          <Text style={styles.brand}>MMG HR &amp; Payroll</Text>
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

        <Text style={styles.footer}>Generated by MMG HR &amp; Payroll on {new Date().toLocaleString("en-PH")}</Text>
      </Page>
    </Document>
  );
}
