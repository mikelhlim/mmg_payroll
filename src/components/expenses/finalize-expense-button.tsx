"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { finalizeExpenseReport } from "@/lib/actions/expenses";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, Loader2, Lock } from "lucide-react";

export function FinalizeExpenseButton({ expensePeriodId }: { expensePeriodId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  function attempt(confirm: boolean) {
    startTransition(async () => {
      const res = await finalizeExpenseReport(expensePeriodId, confirm);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if ("warning" in res) {
        setWarning(res.warning);
        return;
      }
      toast.success("Expense report finalized.");
      setWarning(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setWarning(null);
      }}
    >
      <AlertDialogTrigger render={<Button />}>
        <Lock className="h-4 w-4" /> Finalize report
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finalize this expense report?</AlertDialogTitle>
          <AlertDialogDescription>
            This locks the report from further edits. You can reopen it later to amend.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {warning && (
          <div className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{warning}</span>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              attempt(Boolean(warning));
            }}
          >
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {warning ? "Proceed anyway" : "Finalize"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
