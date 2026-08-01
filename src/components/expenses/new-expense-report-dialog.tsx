"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createExpenseReport } from "@/lib/actions/expenses";
import { expenseReportSchema, type ExpenseReportInput } from "@/lib/validation/expenses";
import { defaultPeriod } from "@/lib/payroll/period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, Plus, Receipt } from "lucide-react";

export function NewExpenseReportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [warning, setWarning] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ExpenseReportInput>({
    resolver: zodResolver(expenseReportSchema),
    defaultValues: { ...defaultPeriod(), note: "" },
  });

  function submit(values: ExpenseReportInput, confirm: boolean) {
    startTransition(async () => {
      const res = await createExpenseReport(values, confirm);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if ("warning" in res) {
        setWarning(res.warning);
        return;
      }
      toast.success("Expense report created.");
      setWarning(null);
      setOpen(false);
      router.push(`/expenses/${res.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setWarning(null);
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus className="h-4 w-4" /> New expense report
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit((v) => submit(v, false))}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> New expense report
            </DialogTitle>
            <DialogDescription>
              Defaults to this week (Saturday–Friday). Adjust the dates if needed — you can attach a
              payroll total afterward, once one is available.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="period_start">Start (Saturday)</Label>
                <Input id="period_start" type="date" {...register("period_start")} />
                {errors.period_start && (
                  <p className="text-xs text-destructive">{errors.period_start.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="period_end">End (Friday)</Label>
                <Input id="period_end" type="date" {...register("period_end")} />
                {errors.period_end && (
                  <p className="text-xs text-destructive">{errors.period_end.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" placeholder="e.g. Week 5" {...register("note")} />
            </div>
          </div>
          {warning && (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{warning}</span>
            </div>
          )}
          <DialogFooter>
            {warning ? (
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => submit(getValues(), true)}
              >
                {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Proceed anyway
              </Button>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Create report
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
