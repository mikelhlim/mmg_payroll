"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteExpenseReport } from "@/lib/actions/expenses";
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
import { Loader2, Trash2 } from "lucide-react";

export function DeleteExpenseButton({ expensePeriodId }: { expensePeriodId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete expense report"
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this draft expense report?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the report and every line item you&apos;ve entered. Finalized reports can&apos;t
            be deleted. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await deleteExpenseReport(expensePeriodId);
                if ("error" in res) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Expense report deleted.");
                router.push("/expenses");
                router.refresh();
              });
            }}
          >
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Delete report
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
