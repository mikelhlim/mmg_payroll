"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { finalizePeriod } from "@/lib/actions/payroll";
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
import { Lock, Loader2 } from "lucide-react";

export function FinalizeButton({
  periodId,
  canFinalize,
  anyNonPositive,
  allComputed,
}: {
  periodId: string;
  canFinalize: boolean;
  anyNonPositive: boolean;
  allComputed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const hint = !allComputed
    ? "Compute every employee first"
    : anyNonPositive
      ? "Resolve net pay ≤ ₱0 first"
      : "";

  if (!canFinalize) {
    return (
      <Button disabled title={hint}>
        <Lock className="h-4 w-4" /> Finalize
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button />}>
        <Lock className="h-4 w-4" /> Finalize run
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finalize this payroll run?</AlertDialogTitle>
          <AlertDialogDescription>
            This locks the period, records each payslip, and draws down every loan and advance
            balance by the amounts deducted. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await finalizePeriod(periodId);
                if ("error" in res) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Payroll finalized! 🎉");
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
