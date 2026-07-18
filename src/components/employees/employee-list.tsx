"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteEmployee } from "@/lib/actions/employees";
import { fullName, type Employee } from "@/lib/types";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Pencil, Search, Trash2, Users } from "lucide-react";

function initials(e: Employee) {
  return `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase();
}

function DeleteButton({ employee }: { employee: Employee }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      const res = await deleteEmployee(employee.id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Employee deleted.");
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${fullName(employee)}`}
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this employee?</AlertDialogTitle>
          <AlertDialogDescription>
            {fullName(employee)} and their advances/loans will be permanently removed. This
            can&apos;t be undone. (Employees with saved payroll history can&apos;t be deleted — mark
            them inactive instead.)
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EmployeeList({ employees }: { employees: Employee[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.first_name, e.last_name, e.middle_name, e.nickname]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [employees, query]);

  if (employees.length === 0) {
    return (
      <Card className="animate-rise">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-7 w-7" />
          </span>
          <div>
            <p className="font-medium">No employees yet</p>
            <p className="text-sm text-muted-foreground">Add your first employee to get started.</p>
          </div>
          <Link href="/employees/new" className={buttonVariants()}>
            Add employee
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or nickname…"
          className="pl-9"
        />
      </div>

      {/* Desktop table */}
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Nickname</th>
              <th className="px-4 py-3 font-medium">Daily wage</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/employees/${e.id}`} className="flex items-center gap-3 font-medium">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(e)}
                    </span>
                    {fullName(e)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{e.nickname ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{formatPHP(e.daily_wage)}</td>
                <td className="px-4 py-3">
                  <Badge variant={e.is_active ? "default" : "secondary"}>
                    {e.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/employees/${e.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                      aria-label={`Edit ${fullName(e)}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <DeleteButton employee={e} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {filtered.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <Link href={`/employees/${e.id}`} className="flex flex-1 items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {initials(e)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{fullName(e)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatPHP(e.daily_wage)}/day
                    {e.nickname ? ` · ${e.nickname}` : ""}
                  </div>
                </div>
              </Link>
              <Badge variant={e.is_active ? "default" : "secondary"}>
                {e.is_active ? "Active" : "Inactive"}
              </Badge>
              <DeleteButton employee={e} />
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No employees match “{query}”.
        </p>
      )}
    </div>
  );
}
