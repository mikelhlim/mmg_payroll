"use client";

import { useTransition } from "react";
import {
  useForm,
  useFieldArray,
  Controller,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { saveExpenseReport, updateExpensePayrollLink } from "@/lib/actions/expenses";
import { expenseTotals, padToMinRows, type ExpenseLineInput } from "@/lib/expenses/totals";
import type { ExpenseItemsPayload, PayrollLinkInput } from "@/lib/validation/expenses";
import { formatCentavos, toCentavos } from "@/lib/money";
import { formatPeriod } from "@/lib/payroll/period";
import type { ExpenseCategory, ExpenseItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Loader2, Plus, Save, Trash2 } from "lucide-react";

export type FinalizedPayrollOption = {
  id: string;
  period_start: string;
  period_end: string;
  netTotalCentavos: number;
};

type PayrollLinkMode = "none" | "run" | "manual";
type PayrollLinkValues = {
  mode: PayrollLinkMode;
  payroll_period_id: string;
  payroll_total_override: number;
};
type RowValues = { item_date: string; description: string; amount: number };
type FormValues = { payrollLink: PayrollLinkValues; itemsByCategory: Record<string, RowValues[]> };

// Same pattern as compute-form.tsx: the first keystroke in a field should
// replace its value outright rather than requiring the user to clear it
// first. onMouseUp must also be suppressed — otherwise the native
// mouseup-after-click collapses the selection onFocus just made.
const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();
const preventMouseUpDeselect = (e: React.MouseEvent<HTMLInputElement>) => e.preventDefault();

function itemsToLines(items: ExpenseItem[]): ExpenseLineInput[] {
  return items.map((i) => ({ item_date: i.item_date, description: i.description, amount: i.amount }));
}

function lineToRow(line: ExpenseLineInput): RowValues {
  return { item_date: line.item_date ?? "", description: line.description ?? "", amount: line.amount };
}

function rowToLine(row: RowValues): ExpenseLineInput {
  return {
    item_date: row.item_date || null,
    description: row.description,
    amount: Number(row.amount) || 0,
  };
}

function buildPayrollLinkDefaults(
  payrollPeriodId: string | null,
  payrollTotalOverride: number | null
): PayrollLinkValues {
  if (payrollPeriodId) {
    return { mode: "run", payroll_period_id: payrollPeriodId, payroll_total_override: 0 };
  }
  if (payrollTotalOverride !== null) {
    return { mode: "manual", payroll_period_id: "", payroll_total_override: payrollTotalOverride };
  }
  return { mode: "none", payroll_period_id: "", payroll_total_override: 0 };
}

function buildDefaults(
  categories: ExpenseCategory[],
  itemsByCategory: Record<string, ExpenseItem[]>,
  payrollPeriodId: string | null,
  payrollTotalOverride: number | null
): FormValues {
  const result: Record<string, RowValues[]> = {};
  for (const c of categories) {
    result[c.id] = padToMinRows(itemsToLines(itemsByCategory[c.id] ?? [])).map(lineToRow);
  }
  return {
    payrollLink: buildPayrollLinkDefaults(payrollPeriodId, payrollTotalOverride),
    itemsByCategory: result,
  };
}

function toPayrollLinkPayload(v: PayrollLinkValues): PayrollLinkInput {
  if (v.mode === "run") {
    return { payroll_period_id: v.payroll_period_id || null, payroll_total_override: null };
  }
  if (v.mode === "manual") {
    return { payroll_period_id: null, payroll_total_override: Number(v.payroll_total_override) || 0 };
  }
  return { payroll_period_id: null, payroll_total_override: null };
}

export function ExpenseReportForm({
  expensePeriodId,
  finalized,
  categories,
  itemsByCategory,
  payrollPeriodId,
  payrollTotalOverride,
  finalizedPayrollPeriods,
  linkedPayrollPeriod,
}: {
  expensePeriodId: string;
  finalized: boolean;
  categories: ExpenseCategory[];
  itemsByCategory: Record<string, ExpenseItem[]>;
  payrollPeriodId: string | null;
  payrollTotalOverride: number | null;
  finalizedPayrollPeriods: FinalizedPayrollOption[];
  /**
   * The currently-linked run's own info, resolved regardless of whether
   * that run is still finalized — a report doesn't freeze its live total
   * just because the linked run isn't in finalizedPayrollPeriods anymore
   * (e.g. it was reopened for amendment after this report linked to it).
   */
  linkedPayrollPeriod: FinalizedPayrollOption | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ro = finalized; // read-only

  const { control, register, handleSubmit, getValues, reset, watch } = useForm<FormValues>({
    defaultValues: buildDefaults(categories, itemsByCategory, payrollPeriodId, payrollTotalOverride),
  });

  // Live preview: identical math to the server (expenseTotals is pure).
  const values = watch();
  const linkedRun =
    values.payrollLink.payroll_period_id === linkedPayrollPeriod?.id
      ? linkedPayrollPeriod
      : finalizedPayrollPeriods.find((r) => r.id === values.payrollLink.payroll_period_id);
  const livePayrollCentavos =
    values.payrollLink.mode === "run"
      ? (linkedRun?.netTotalCentavos ?? 0)
      : values.payrollLink.mode === "manual"
        ? toCentavos(values.payrollLink.payroll_total_override)
        : 0;
  const totals = expenseTotals({
    payrollNetTotalCentavos: livePayrollCentavos,
    categories,
    itemsByCategory: Object.fromEntries(
      categories.map((c) => [c.id, (values.itemsByCategory[c.id] ?? []).map(rowToLine)])
    ),
  });

  function toPayload(v: FormValues): ExpenseItemsPayload {
    return categories.flatMap((c) =>
      (v.itemsByCategory[c.id] ?? []).map((row) => ({
        category_id: c.id,
        item_date: row.item_date || null,
        description: row.description,
        amount: Number(row.amount) || 0,
      }))
    );
  }

  function onSave() {
    const current = getValues();
    if (current.payrollLink.mode === "run" && !current.payrollLink.payroll_period_id) {
      toast.error("Select a payroll run, or switch to entering an amount manually.");
      return;
    }
    startTransition(async () => {
      const linkRes = await updateExpensePayrollLink(
        expensePeriodId,
        toPayrollLinkPayload(current.payrollLink)
      );
      if ("error" in linkRes) {
        toast.error(linkRes.error);
        return;
      }
      const res = await saveExpenseReport(expensePeriodId, toPayload(current));
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Expense report saved.");
      // Re-baseline so a stale isDirty (if this form ever grows a leave-guard)
      // can't get stuck true after router.refresh() re-fetches server data —
      // see the compute-form.tsx / employee-form.tsx fix for this same bug.
      reset(current);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Payroll Total</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ro ? (
            <p className="text-sm text-muted-foreground">
              {payrollPeriodId ? (
                <>
                  Linked to{" "}
                  <Link href={`/payroll/${payrollPeriodId}`} className="underline hover:text-foreground">
                    {linkedPayrollPeriod
                      ? formatPeriod(linkedPayrollPeriod.period_start, linkedPayrollPeriod.period_end)
                      : "that payroll run"}
                  </Link>{" "}
                  — the total stays live even now that this report is finalized.
                </>
              ) : payrollTotalOverride !== null ? (
                `Entered manually: ${formatCentavos(toCentavos(payrollTotalOverride))}`
              ) : (
                "Not set."
              )}
            </p>
          ) : (
            <>
              <Controller
                control={control}
                name="payrollLink.mode"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full sm:w-[320px]">
                      <SelectValue>
                        {(v: PayrollLinkMode) =>
                          v === "run"
                            ? "Link a finalized payroll run"
                            : v === "manual"
                              ? "Enter amount manually"
                              : "Not set yet"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set yet</SelectItem>
                      <SelectItem value="run">Link a finalized payroll run</SelectItem>
                      <SelectItem value="manual">Enter amount manually</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />

              {values.payrollLink.mode === "run" &&
                (finalizedPayrollPeriods.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No finalized payroll runs yet —{" "}
                    <Link href="/payroll" className="underline hover:text-foreground">
                      finalize one
                    </Link>{" "}
                    first, or enter an amount manually.
                  </p>
                ) : (
                  <Controller
                    control={control}
                    name="payrollLink.payroll_period_id"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full sm:w-[320px]">
                          <SelectValue>
                            {(v: string) => {
                              const r = finalizedPayrollPeriods.find((rr) => rr.id === v);
                              return r
                                ? `${formatPeriod(r.period_start, r.period_end)} · ${formatCentavos(r.netTotalCentavos)}`
                                : "Select a payroll run";
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {finalizedPayrollPeriods.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {formatPeriod(r.period_start, r.period_end)} ·{" "}
                              {formatCentavos(r.netTotalCentavos)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                ))}

              {values.payrollLink.mode === "manual" && (
                <div className="w-full sm:w-[320px]">
                  <MoneyInput
                    onFocus={selectOnFocus}
                    onMouseUp={preventMouseUpDeselect}
                    {...register("payrollLink.payroll_total_override", { valueAsNumber: true })}
                  />
                </div>
              )}

              {values.payrollLink.mode === "none" && (
                <p className="text-xs text-muted-foreground">
                  This report can&apos;t be finalized until a payroll total is set.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Total Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Current Payroll Total
              {values.payrollLink.mode === "run" && linkedRun && (
                <Link
                  href={`/payroll/${linkedRun.id}`}
                  className="ml-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </span>
            <span className="tabular-nums">{formatCentavos(totals.payrollTotalCentavos)}</span>
          </div>
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{c.name} Total</span>
              <span className="tabular-nums">{formatCentavos(totals.byCategoryCentavos[c.id] ?? 0)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
            <span>Grand Total</span>
            <span className="tabular-nums text-primary">{formatCentavos(totals.grandTotalCentavos)}</span>
          </div>
        </CardContent>
      </Card>

      {categories.map((category) => (
        <ExpenseCategoryCard
          key={category.id}
          category={category}
          control={control}
          register={register}
          readOnly={ro}
          subtotalCentavos={totals.byCategoryCentavos[category.id] ?? 0}
        />
      ))}

      {!ro && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft
          </Button>
        </div>
      )}
    </form>
  );
}

function ExpenseCategoryCard({
  category,
  control,
  register,
  readOnly,
  subtotalCentavos,
}: {
  category: ExpenseCategory;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  readOnly: boolean;
  subtotalCentavos: number;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `itemsByCategory.${category.id}` as const,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>
            {category.name}
            {!category.is_active && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(archived type)</span>
            )}
          </span>
          <span className="text-sm font-normal tabular-nums text-muted-foreground">
            {formatCentavos(subtotalCentavos)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[160px]">Amount</TableHead>
              {!readOnly && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={field.id}>
                <TableCell>
                  <Input
                    type="date"
                    disabled={readOnly}
                    {...register(`itemsByCategory.${category.id}.${index}.item_date` as const, {
                      disabled: readOnly,
                    })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    placeholder="Description"
                    disabled={readOnly}
                    {...register(`itemsByCategory.${category.id}.${index}.description` as const, {
                      disabled: readOnly,
                    })}
                  />
                </TableCell>
                <TableCell>
                  <MoneyInput
                    disabled={readOnly}
                    onFocus={selectOnFocus}
                    onMouseUp={preventMouseUpDeselect}
                    {...register(`itemsByCategory.${category.id}.${index}.amount` as const, {
                      valueAsNumber: true,
                      disabled: readOnly,
                    })}
                  />
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove row"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ item_date: "", description: "", amount: 0 })}
          >
            <Plus className="h-4 w-4" /> Add row
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
