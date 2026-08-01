import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ExpensePeriod } from "@/lib/types";
import { peso, dateRange } from "@/lib/pdf/format";
import { expenseTotals, type ExpenseLineInput } from "@/lib/expenses/totals";
import { fromCentavos } from "@/lib/money";

export type ExpensePdfCategory = {
  id: string;
  name: string;
  /** When true, each item in this category also gets its own detail page below. */
  perItemPdfPages: boolean;
  items: ExpenseLineInput[];
};

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, color: "#1e1b2e", fontFamily: "Helvetica" },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  brand: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#6d4bd8" },
  docType: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: "#6b7280" },
  draftBadge: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: "#b45309" },
  period: { fontSize: 7, color: "#6b7280", marginBottom: 8 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e5e1f0", marginVertical: 6 },
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6d4bd8", marginBottom: 4, marginTop: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  summaryLabel: { color: "#374151" },
  summaryValue: { fontFamily: "Helvetica" },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    marginTop: 3,
    borderTopWidth: 1.5,
    borderTopColor: "#6d4bd8",
  },
  grandLabel: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  grandValue: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#6d4bd8" },
  catHead: {
    flexDirection: "row",
    backgroundColor: "#efeafc",
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginTop: 10,
  },
  catHeadText: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#6d4bd8" },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#c9c3dd",
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  tableHeadText: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: "#6b7280" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  colDate: { width: 60 },
  colDesc: { flex: 1 },
  colAmount: { width: 80, textAlign: "right" },
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: "#faf9fc",
    borderTopWidth: 1,
    borderTopColor: "#c9c3dd",
  },
  subtotalLabel: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7 },
  subtotalValue: { width: 80, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 7 },
  emptyNote: { fontSize: 7, color: "#9ca3af", fontStyle: "italic", paddingVertical: 4, paddingHorizontal: 6 },
  footer: { position: "absolute", bottom: 20, left: 28, right: 28, fontSize: 8, color: "#9ca3af", textAlign: "center" },

  // Per-item detail page: each item is a self-contained voucher (repeats the
  // brand/period/status context, since it may be printed or handed out on
  // its own rather than read in sequence with the rest of the report).
  itemPageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  itemPagePeriod: { fontSize: 7, color: "#6b7280", marginBottom: 4 },
  itemPageCategory: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#6d4bd8", marginTop: 24 },
  itemPageIndex: { fontSize: 8, color: "#9ca3af", marginBottom: 20 },
  itemPageFieldRow: { marginBottom: 16 },
  itemPageFieldLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: "#9ca3af", marginBottom: 3 },
  itemPageFieldValue: { fontSize: 11, color: "#1e1b2e" },
  itemPageAmountValue: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#6d4bd8" },
});

export function ExpenseReportDocument({
  period,
  finalized,
  categories,
  payrollNetTotalCentavos,
}: {
  period: ExpensePeriod;
  finalized: boolean;
  categories: ExpensePdfCategory[];
  payrollNetTotalCentavos: number;
}) {
  const totals = expenseTotals({
    payrollNetTotalCentavos,
    categories,
    itemsByCategory: Object.fromEntries(categories.map((c) => [c.id, c.items])),
  });

  return (
    <Document title={`Expense report ${period.period_start} to ${period.period_end}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>MMG HR &amp; Payroll</Text>
          <Text style={finalized ? styles.docType : styles.draftBadge}>
            {finalized ? "EXPENSE REPORT" : "EXPENSE REPORT · DRAFT"}
          </Text>
        </View>
        <Text style={styles.period}>
          {dateRange(period)}
          {period.note ? ` · ${period.note}` : ""}
        </Text>

        <View style={styles.rule} />

        <Text style={styles.sectionTitle}>TOTAL EXPENSES</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Current Payroll Total</Text>
          <Text style={styles.summaryValue}>{peso(fromCentavos(totals.payrollTotalCentavos))}</Text>
        </View>
        {categories.map((c) => (
          <View key={c.id} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{c.name} Total</Text>
            <Text style={styles.summaryValue}>
              {peso(fromCentavos(totals.byCategoryCentavos[c.id] ?? 0))}
            </Text>
          </View>
        ))}
        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>GRAND TOTAL</Text>
          <Text style={styles.grandValue}>{peso(fromCentavos(totals.grandTotalCentavos))}</Text>
        </View>

        {categories.map((c) => (
          <View key={c.id}>
            <View style={styles.catHead}>
              <Text style={styles.catHeadText}>{c.name}</Text>
            </View>
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadText, styles.colDate]}>DATE</Text>
              <Text style={[styles.tableHeadText, styles.colDesc]}>DESCRIPTION</Text>
              <Text style={[styles.tableHeadText, styles.colAmount]}>AMOUNT</Text>
            </View>
            {c.items.length === 0 ? (
              <Text style={styles.emptyNote}>No items</Text>
            ) : (
              c.items.map((item, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={styles.colDate}>{item.item_date ?? "—"}</Text>
                  <Text style={styles.colDesc}>{item.description || "—"}</Text>
                  <Text style={styles.colAmount}>{peso(item.amount)}</Text>
                </View>
              ))
            )}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Subtotal</Text>
              <Text style={styles.subtotalValue}>
                {peso(fromCentavos(totals.byCategoryCentavos[c.id] ?? 0))}
              </Text>
            </View>
          </View>
        ))}

        {categories
          .filter((c) => c.perItemPdfPages)
          .flatMap((c) => {
            // Padding/blank rows (amount 0) never get their own page — a
            // detail page only makes sense for an item someone actually
            // entered a cost for.
            const pricedItems = c.items.filter((item) => item.amount > 0);
            return pricedItems.map((item, idx) => (
              <View key={`${c.id}-${idx}`} break>
                <View style={styles.itemPageHeader}>
                  <Text style={styles.brand}>MMG HR &amp; Payroll</Text>
                  <Text style={finalized ? styles.docType : styles.draftBadge}>
                    {finalized ? "EXPENSE ITEM" : "EXPENSE ITEM · DRAFT"}
                  </Text>
                </View>
                <Text style={styles.itemPagePeriod}>
                  {dateRange(period)}
                  {period.note ? ` · ${period.note}` : ""}
                </Text>
                <View style={styles.rule} />

                <Text style={styles.itemPageCategory}>{c.name}</Text>
                <Text style={styles.itemPageIndex}>
                  Item {idx + 1} of {pricedItems.length}
                </Text>

                <View style={styles.itemPageFieldRow}>
                  <Text style={styles.itemPageFieldLabel}>DATE</Text>
                  <Text style={styles.itemPageFieldValue}>{item.item_date ?? "—"}</Text>
                </View>
                <View style={styles.itemPageFieldRow}>
                  <Text style={styles.itemPageFieldLabel}>DESCRIPTION</Text>
                  <Text style={styles.itemPageFieldValue}>{item.description || "—"}</Text>
                </View>
                <View style={styles.itemPageFieldRow}>
                  <Text style={styles.itemPageFieldLabel}>AMOUNT</Text>
                  <Text style={styles.itemPageAmountValue}>{peso(item.amount)}</Text>
                </View>
              </View>
            ));
          })}

        <Text
          style={styles.footer}
          render={({ pageNumber }) =>
            `Page ${pageNumber} · Generated by MMG HR & Payroll on ${new Date().toLocaleDateString("en-PH")}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
