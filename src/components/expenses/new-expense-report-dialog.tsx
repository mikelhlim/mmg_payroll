"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createExpenseReport } from "@/lib/actions/expenses";
import { expenseReportSchema, type ExpenseReportInput } from "@/lib/validation/expenses";
import { formatPeriod } from "@/lib/payroll/period";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Receipt } from "lucide-react";

export type AvailablePayrollPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  status: "draft" | "finalized";
};

export function NewExpenseReportDialog({
  payrollPeriods,
}: {
  payrollPeriods: AvailablePayrollPeriod[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ExpenseReportInput>({
    resolver: zodResolver(expenseReportSchema),
    defaultValues: { payroll_period_id: payrollPeriods[0]?.id ?? "", note: "" },
  });

  function submit(values: ExpenseReportInput) {
    startTransition(async () => {
      const res = await createExpenseReport(values);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Expense report created.");
      setOpen(false);
      router.push(`/expenses/${res.id}`);
    });
  }

  if (payrollPeriods.length === 0) {
    return (
      <Link href="/payroll" className={buttonVariants({ variant: "outline" })}>
        <Receipt className="h-4 w-4" /> Every payroll run has a report
      </Link>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="h-4 w-4" /> New expense report
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(submit)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> New expense report
            </DialogTitle>
            <DialogDescription>Pick the payroll week this expense report covers.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="payroll_period_id">Payroll week</Label>
              <Controller
                control={control}
                name="payroll_period_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="payroll_period_id" className="w-full">
                      <SelectValue>
                        {(v: string) => {
                          const p = payrollPeriods.find((pp) => pp.id === v);
                          return p
                            ? `${formatPeriod(p.period_start, p.period_end)} · ${
                                p.status === "finalized" ? "Finalized" : "Draft"
                              }`
                            : "Select a payroll run";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {payrollPeriods.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {formatPeriod(p.period_start, p.period_end)} ·{" "}
                          {p.status === "finalized" ? "Finalized" : "Draft"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.payroll_period_id && (
                <p className="text-xs text-destructive">{errors.payroll_period_id.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" placeholder="e.g. Week 5" {...register("note")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
