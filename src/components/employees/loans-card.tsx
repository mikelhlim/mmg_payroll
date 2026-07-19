"use client";

import { useTransition } from "react";
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
import { Landmark, Loader2 } from "lucide-react";

const LABELS: Record<LoanType, string> = { SSS: "SSS loan", PAGIBIG: "Pag-IBIG loan" };

function LoanRow({ employeeId, type, loan }: { employeeId: string; type: LoanType; loan?: Loan }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const isNew = !loan;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<LoanInput>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      loan_type: type,
      principal: loan?.principal ?? 0,
      current_balance: loan?.current_balance ?? 0,
      start_date: loan?.start_date ?? "",
    },
  });

  // A freshly-added loan's outstanding balance is its principal — keep them in
  // sync as the user types, unless they've manually edited the balance field.
  // (Editing an existing loan never auto-syncs; balance is independent there.)
  const principalRegistration = register("principal", {
    valueAsNumber: true,
    onChange: (e) => {
      if (!isNew || dirtyFields.current_balance) return;
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
      toast.success(`${LABELS[type]} saved.`);
      router.refresh();
    });
  }

  function onClear() {
    startTransition(async () => {
      const res = await clearLoan(employeeId, type);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${LABELS[type]} removed.`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        handleSubmit(onSubmit)(e);
      }}
      className="rounded-xl border p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">{LABELS[type]}</p>
        {loan && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            Balance {formatPHP(loan.current_balance)} of {formatPHP(loan.principal)}
            {loan.start_date ? ` · since ${loan.start_date}` : ""}
          </span>
        )}
      </div>
      <input type="hidden" {...register("loan_type")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${type}-principal`}>Principal</Label>
          <MoneyInput id={`${type}-principal`} {...principalRegistration} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${type}-balance`}>Current balance</Label>
          <MoneyInput
            id={`${type}-balance`}
            {...register("current_balance", { valueAsNumber: true })}
          />
          {isNew && !dirtyFields.current_balance && (
            <p className="text-xs text-muted-foreground">Defaults to principal</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${type}-start`}>Start date</Label>
          <Input id={`${type}-start`} type="date" {...register("start_date")} />
        </div>
      </div>
      {(errors.principal || errors.current_balance) && (
        <p className="mt-2 text-xs text-destructive">
          {errors.principal?.message ?? errors.current_balance?.message}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || (!isDirty && !loan)}>
          {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {loan ? "Update" : "Add loan"}
        </Button>
        {loan && (
          <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={pending}>
            Remove
          </Button>
        )}
      </div>
    </form>
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
      <CardContent className="space-y-4">
        <LoanRow employeeId={employeeId} type="SSS" loan={sss} />
        <LoanRow employeeId={employeeId} type="PAGIBIG" loan={pagibig} />
      </CardContent>
    </Card>
  );
}
