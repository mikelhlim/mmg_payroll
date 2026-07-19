"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createAdvance, updateAdvance, deleteAdvance } from "@/lib/actions/obligations";
import { advanceSchema, advanceDefaults, MAX_ADVANCES, type AdvanceInput } from "@/lib/validation/obligations";
import type { Advance } from "@/lib/types";
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
import { HandCoins, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export function AdvanceDialog({
  employeeId,
  advance,
  trigger,
}: {
  employeeId: string;
  advance?: Advance;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(advance);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<AdvanceInput>({
    resolver: zodResolver(advanceSchema),
    defaultValues: advance
      ? {
          label: advance.label ?? "",
          start_date: advance.start_date ?? "",
          total_advance: advance.total_advance,
          current_balance: advance.current_balance,
        }
      : advanceDefaults,
  });

  // A freshly-added advance's outstanding balance is its total — keep them in
  // sync as the user types, unless they've manually edited the balance field.
  // (Editing an existing advance never auto-syncs; balance is independent.)
  const totalAdvanceRegistration = register("total_advance", {
    valueAsNumber: true,
    onChange: (e) => {
      if (isEdit || dirtyFields.current_balance) return;
      setValue("current_balance", Number(e.target.value) || 0, { shouldDirty: false });
    },
  });

  function onSubmit(values: AdvanceInput) {
    startTransition(async () => {
      const res = isEdit
        ? await updateAdvance(advance!.id, employeeId, values)
        : await createAdvance(employeeId, values);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Advance updated." : "Advance added.");
      setOpen(false);
      if (!isEdit) reset(advanceDefaults);
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
            <DialogTitle>{isEdit ? "Edit advance" : "Add advance"}</DialogTitle>
            <DialogDescription>
              Record a cash advance. Its balance is drawn down during weekly payroll.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="adv-label">Label</Label>
              <Input id="adv-label" placeholder="e.g. Emergency advance" {...register("label")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="adv-total">Total advance</Label>
                <MoneyInput id="adv-total" {...totalAdvanceRegistration} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adv-balance">Current balance</Label>
                <MoneyInput
                  id="adv-balance"
                  {...register("current_balance", { valueAsNumber: true })}
                />
                {!isEdit && !dirtyFields.current_balance && (
                  <p className="text-xs text-muted-foreground">Defaults to total advance</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adv-start">Start date</Label>
              <Input id="adv-start" type="date" {...register("start_date")} />
            </div>
            {(errors.total_advance || errors.current_balance) && (
              <p className="text-xs text-destructive">
                {errors.total_advance?.message ?? errors.current_balance?.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Add advance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAdvance({ advance, employeeId }: { advance: Advance; employeeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="Delete advance" />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this advance?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the advance. Advances with payment history can&apos;t be
            deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await deleteAdvance(advance.id, employeeId);
                if ("error" in res) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Advance deleted.");
                router.refresh();
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AdvancesCard({ employeeId, advances }: { employeeId: string; advances: Advance[] }) {
  const activeCount = advances.filter((a) => a.is_active).length;
  const atLimit = activeCount >= MAX_ADVANCES;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" /> Cash advances
          </CardTitle>
          <CardDescription>
            Up to {MAX_ADVANCES} active advances. {activeCount} active.
          </CardDescription>
        </div>
        <AdvanceDialog
          employeeId={employeeId}
          trigger={
            <Button size="sm" disabled={atLimit}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          }
        />
      </CardHeader>
      <CardContent>
        {advances.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No advances recorded.</p>
        ) : (
          <ul className="divide-y">
            {advances.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {a.label ?? "Advance"}
                    {!a.is_active && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        Paid off
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Balance {formatPHP(a.current_balance)} of {formatPHP(a.total_advance)}
                    {a.start_date ? ` · since ${a.start_date}` : ""}
                  </p>
                </div>
                <AdvanceDialog
                  employeeId={employeeId}
                  advance={a}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Edit advance">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  }
                />
                <DeleteAdvance advance={a} employeeId={employeeId} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
