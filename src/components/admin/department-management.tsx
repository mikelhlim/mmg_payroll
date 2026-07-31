"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createDepartment,
  updateDepartment,
  reorderDepartment,
  deleteDepartment,
} from "@/lib/actions/departments";
import {
  departmentSchema,
  departmentDefaults,
  type DepartmentInput,
} from "@/lib/validation/departments";
import type { Department } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function DepartmentDialog({
  department,
  trigger,
}: {
  department?: Department;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(department);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DepartmentInput>({
    resolver: zodResolver(departmentSchema),
    defaultValues: department ? { name: department.name } : departmentDefaults,
  });

  function onSubmit(values: DepartmentInput) {
    startTransition(async () => {
      const res = isEdit
        ? await updateDepartment(department!.id, values)
        : await createDepartment(values);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Department renamed." : "Department added.");
      setOpen(false);
      if (!isEdit) reset(departmentDefaults);
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
            <DialogTitle>{isEdit ? "Rename department" : "Add department"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Updates the name everywhere it's shown."
                : "New departments are added to the end of the processing order — reorder afterward if needed."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-1.5">
              <Label htmlFor="dept-name">Name</Label>
              <Input id="dept-name" autoFocus {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEdit ? "Save" : "Add department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDepartmentButton({ department }: { department: Department }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  function onConfirm() {
    startTransition(async () => {
      const res = await deleteDepartment(department.id, warning !== null);
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
      toast.success("Department deleted.");
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
            aria-label={`Delete ${department.name}`}
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {department.name}?</AlertDialogTitle>
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
            {warning ? "Delete anyway" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DepartmentRow({
  department,
  employeeCount,
  isFirst,
  isLast,
}: {
  department: Department;
  employeeCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const res = await reorderDepartment(department.id, direction);
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
            aria-label={`Move ${department.name} up`}
            disabled={isFirst || pending}
            onClick={() => move("up")}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            aria-label={`Move ${department.name} down`}
            disabled={isLast || pending}
            onClick={() => move("down")}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
      <td className="py-3 pr-4 font-medium">{department.name}</td>
      <td className="py-3 pr-4">
        <Badge variant="secondary">
          {employeeCount} employee{employeeCount === 1 ? "" : "s"}
        </Badge>
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <DepartmentDialog
            department={department}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Rename ${department.name}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <DeleteDepartmentButton department={department} />
        </div>
      </td>
    </tr>
  );
}

export function DepartmentManagement({
  departments,
  employeeCounts,
}: {
  departments: Department[];
  employeeCounts: Record<string, number>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Departments</CardTitle>
          <CardDescription>
            Processing order top-to-bottom — used for the employee list and payroll runs.
          </CardDescription>
        </div>
        <DepartmentDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" /> Add department
            </Button>
          }
        />
      </CardHeader>
      <CardContent>
        {departments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No departments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Employees</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d, i) => (
                  <DepartmentRow
                    key={d.id}
                    department={d}
                    employeeCount={employeeCounts[d.id] ?? 0}
                    isFirst={i === 0}
                    isLast={i === departments.length - 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
