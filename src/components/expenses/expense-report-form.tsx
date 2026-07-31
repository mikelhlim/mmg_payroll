"use client";

import { useTransition } from "react";
import { useForm, useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { saveExpenseReport } from "@/lib/actions/expenses";
import { expenseTotals, padToMinRows, type ExpenseLineInput } from "@/lib/expenses/totals";
import type { ExpenseItemsPayload } from "@/lib/validation/expenses";
import { formatCentavos } from "@/lib/money";
import type { ExpenseCategory, ExpenseItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Loader2, Plus, Save, Trash2 } from "lucide-react";

type RowValues = { item_date: string; description: string; amount: number };
type FormValues = { itemsByCategory: Record<string, RowValues[]> };

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

function buildDefaults(
  categories: ExpenseCategory[],
  itemsByCategory: Record<string, ExpenseItem[]>
): FormValues {
  const result: Record<string, RowValues[]> = {};
  for (const c of categories) {
    result[c.id] = padToMinRows(itemsToLines(itemsByCategory[c.id] ?? [])).map(lineToRow);
  }
  return { itemsByCategory: result };
}

export function ExpenseReportForm({
  expensePeriodId,
  finalized,
  categories,
  itemsByCategory,
  payrollPeriodId,
  payrollNetTotalCentavos,
}: {
  expensePeriodId: string;
  finalized: boolean;
  categories: ExpenseCategory[];
  itemsByCategory: Record<string, ExpenseItem[]>;
  payrollPeriodId: string;
  payrollNetTotalCentavos: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ro = finalized; // read-only

  const { control, register, handleSubmit, getValues, reset, watch } = useForm<FormValues>({
    defaultValues: buildDefaults(categories, itemsByCategory),
  });

  // Live preview: identical math to the server (expenseTotals is pure).
  const values = watch();
  const totals = expenseTotals({
    payrollNetTotalCentavos,
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
    startTransition(async () => {
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
          <CardTitle>Total Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Link
              href={`/payroll/${payrollPeriodId}`}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              Current Payroll Total <ExternalLink className="h-3 w-3" />
            </Link>
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
