"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reopenExpenseReport } from "@/lib/actions/expenses";
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
import { Loader2, PencilLine } from "lucide-react";

export function AmendExpenseButton({ expensePeriodId }: { expensePeriodId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>
        <PencilLine className="h-4 w-4" /> Amend
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Amend this finalized report?</AlertDialogTitle>
          <AlertDialogDescription>
            This reopens the report for editing. Make your changes, then finalize again — this is
            recorded in the transaction log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await reopenExpenseReport(expensePeriodId);
                if ("error" in res) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Expense report reopened for amendment.");
                router.refresh();
              });
            }}
          >
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Reopen for amendment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
