"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { saveLoan, clearLoan } from "@/lib/actions/obligations";
import { loanSchema, type LoanInput } from "@/lib/validation/obligations";
import type { Loan, LoanType } from "@/lib/types";
import { formatPHP } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Landmark, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export const LOAN_LABELS: Record<LoanType, string> = { SSS: "SSS loan", PAGIBIG: "Pag-IBIG loan" };

/**
 * Add/edit a government loan. Mirrors AdvanceDialog's exact pattern (dialog +
 * custom trigger) so it can be used both on the employee profile and inline
 * during an active payroll run, "similar to the Advances use case".
 */
export function LoanDialog({
  employeeId,
  loanType,
  loan,
  trigger,
}: {
  employeeId: string;
  loanType: LoanType;
  loan?: Loan;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(loan);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<LoanInput>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      loan_type: loanType,
      principal: loan?.principal ?? 0,
      current_balance: loan?.current_balance ?? 0,
      start_date: loan?.start_date ?? "",
    },
  });

  // A freshly-added loan's outstanding balance is its principal — keep them in
  // sync as the user types, unless they've manually edited the balance field.
  const principalRegistration = register("principal", {
    valueAsNumber: true,
    onChange: (e) => {
      if (isEdit || dirtyFields.current_balance) return;
      setValue("current_balance", Number(e.target.value) || 0, { shouldDirty: false });
    },
  });

  function onSubmit(values: LoanInput) {
    startTransition(async () => {
      const res = await saveLoan(employeeId, values);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${LOAN_LABELS[loanType]} saved.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        {/* Dialog content is portalled to document.body, but React still
            bubbles synthetic events up the COMPONENT tree — stopPropagation
            keeps this submit from also triggering an ancestor <form> (e.g.
            ComputeForm) that this dialog happens to be rendered inside of. */}
        <form
          onSubmit={(e) => {
            e.stopPropagation();
            handleSubmit(onSubmit)(e);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {isEdit ? `Edit ${LOAN_LABELS[loanType]}` : `Add ${LOAN_LABELS[loanType]}`}
            </DialogTitle>
            <DialogDescription>
              Weekly repayments during payroll draw this balance down.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${loanType}-principal`}>Principal</Label>
                <MoneyInput id={`${loanType}-principal`} {...principalRegistration} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${loanType}-balance`}>Current balance</Label>
                <MoneyInput
                  id={`${loanType}-balance`}
                  {...register("current_balance", { valueAsNumber: true })}
                />
                {!isEdit && !dirtyFields.current_balance && (
                  <p className="text-xs text-muted-foreground">Defaults to principal</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${loanType}-start`}>Start date</Label>
              <Input id={`${loanType}-start`} type="date" {...register("start_date")} />
            </div>
            {(errors.principal || errors.current_balance || errors.start_date) && (
              <p className="text-xs text-destructive">
                {errors.principal?.message ?? errors.current_balance?.message ?? errors.start_date?.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : `Add ${LOAN_LABELS[loanType]}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveLoan({
  employeeId,
  loanType,
}: {
  employeeId: string;
  loanType: LoanType;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${LOAN_LABELS[loanType]}`}
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this {LOAN_LABELS[loanType]}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the loan record. Loans with payment history can&apos;t be
            removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await clearLoan(employeeId, loanType);
                if ("error" in res) {
                  toast.error(res.error);
                  return;
                }
                toast.success(`${LOAN_LABELS[loanType]} removed.`);
                router.refresh();
              })
            }
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function LoanTypeRow({
  employeeId,
  loanType,
  loan,
}: {
  employeeId: string;
  loanType: LoanType;
  loan?: Loan;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{LOAN_LABELS[loanType]}</p>
        {loan ? (
          <p className="text-xs text-muted-foreground">
            Balance {formatPHP(loan.current_balance)} of {formatPHP(loan.principal)}
            {loan.start_date ? ` · since ${loan.start_date}` : ""}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No loan on record.</p>
        )}
      </div>
      <LoanDialog
        employeeId={employeeId}
        loanType={loanType}
        loan={loan}
        trigger={
          loan ? (
            <Button variant="ghost" size="icon" aria-label={`Edit ${LOAN_LABELS[loanType]}`}>
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          )
        }
      />
      {loan && <RemoveLoan employeeId={employeeId} loanType={loanType} />}
    </div>
  );
}

export function LoansCard({ employeeId, loans }: { employeeId: string; loans: Loan[] }) {
  const sss = loans.find((l) => l.loan_type === "SSS");
  const pagibig = loans.find((l) => l.loan_type === "PAGIBIG");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" /> Government loans
        </CardTitle>
        <CardDescription>
          SSS and Pag-IBIG loan balances. Weekly repayments during payroll draw these down.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <LoanTypeRow employeeId={employeeId} loanType="SSS" loan={sss} />
        <LoanTypeRow employeeId={employeeId} loanType="PAGIBIG" loan={pagibig} />
      </CardContent>
    </Card>
  );
}
