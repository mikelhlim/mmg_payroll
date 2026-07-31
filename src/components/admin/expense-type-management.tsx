"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createExpenseCategory,
  updateExpenseCategory,
  reorderExpenseCategory,
  deleteExpenseCategory,
} from "@/lib/actions/expense-categories";
import type { ExpenseCategoryInput } from "@/lib/validation/expenses";
import type { ExpenseCategory } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type CategoryFormValues = { name: string; defaultDescriptionsText: string };

function toDescriptions(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ExpenseCategoryDialog({
  category,
  trigger,
}: {
  category?: ExpenseCategory;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(category);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    defaultValues: category
      ? { name: category.name, defaultDescriptionsText: category.default_descriptions.join("\n") }
      : { name: "", defaultDescriptionsText: "" },
  });

  function onSubmit(values: CategoryFormValues) {
    const input: ExpenseCategoryInput = {
      name: values.name,
      default_descriptions: toDescriptions(values.defaultDescriptionsText),
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateExpenseCategory(category!.id, input)
        : await createExpenseCategory(input);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Expense type updated." : "Expense type added.");
      setOpen(false);
      if (!isEdit) reset({ name: "", defaultDescriptionsText: "" });
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.stopPropagation();
            handleSubmit(onSubmit)(e);
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit expense type" : "Add expense type"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Updates the name and default line descriptions everywhere it's shown."
                : "New expense types are added to the end of the processing order — reorder afterward if needed."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" autoFocus {...register("name", { required: true })} />
              {errors.name && <p className="text-xs text-destructive">Name is required</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-defaults">Default line descriptions</Label>
              <Textarea
                id="cat-defaults"
                rows={5}
                placeholder={"One per line, e.g.\nCTK Flowers\nAnilao/Tagbakin"}
                {...register("defaultDescriptionsText")}
              />
              <p className="text-xs text-muted-foreground">
                Seeds this type&apos;s rows on its very first expense report, or on any report with no
                earlier one to carry descriptions forward from.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEdit ? "Save" : "Add expense type"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteExpenseCategoryButton({ category }: { category: ExpenseCategory }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  function onConfirm() {
    startTransition(async () => {
      const res = await deleteExpenseCategory(category.id, warning !== null);
      if ("error" in res) {
        toast.error(res.error);
        setOpen(false);
        setWarning(null);
        return;
      }
      if ("warning" in res) {
        setWarning(res.warning);
        return;
      }
      toast.success(warning ? "Expense type archived." : "Expense type deleted.");
      setOpen(false);
      setWarning(null);
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setWarning(null);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${category.name}`}
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{warning ? `Archive ${category.name}?` : `Delete ${category.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>{warning ?? "This can't be undone."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {warning ? "Archive" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ExpenseCategoryRow({
  category,
  isFirst,
  isLast,
}: {
  category: ExpenseCategory;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const res = await reorderExpenseCategory(category.id, direction);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4">
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            aria-label={`Move ${category.name} up`}
            disabled={isFirst || pending}
            onClick={() => move("up")}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            aria-label={`Move ${category.name} down`}
            disabled={isLast || pending}
            onClick={() => move("down")}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
      <td className="py-3 pr-4 font-medium">{category.name}</td>
      <td className="max-w-[260px] py-3 pr-4 text-xs text-muted-foreground">
        {category.default_descriptions.length > 0 ? category.default_descriptions.join(", ") : "—"}
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <ExpenseCategoryDialog
            category={category}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Edit ${category.name}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <DeleteExpenseCategoryButton category={category} />
        </div>
      </td>
    </tr>
  );
}

export function ExpenseTypeManagement({ categories }: { categories: ExpenseCategory[] }) {
  const active = categories.filter((c) => c.is_active);
  const archived = categories.filter((c) => !c.is_active);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Expense Types</CardTitle>
          <CardDescription>
            Processing order top-to-bottom — used on every new expense report.
          </CardDescription>
        </div>
        <ExpenseCategoryDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" /> Add expense type
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-6">
        {active.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No expense types yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Default descriptions</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((c, i) => (
                  <ExpenseCategoryRow
                    key={c.id}
                    category={c}
                    isFirst={i === 0}
                    isLast={i === active.length - 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {archived.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Archived (still shown on past reports)
            </p>
            <div className="flex flex-wrap gap-2">
              {archived.map((c) => (
                <Badge key={c.id} variant="secondary">
                  {c.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
