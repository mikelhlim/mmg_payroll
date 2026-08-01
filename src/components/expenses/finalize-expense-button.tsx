"use client";

import { useTransition } from "react";
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
import { Loader2, Lock } from "lucide-react";

export function FinalizeExpenseButton({ expensePeriodId }: { expensePeriodId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
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
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await finalizeExpenseReport(expensePeriodId);
                if ("error" in res) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Expense report finalized.");
                router.refresh();
              });
            }}
          >
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Finalize
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
