"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteEmployee } from "@/lib/actions/employees";
import { groupByDepartment } from "@/lib/departments";
import { DepartmentGroupHeading } from "@/components/department-group-heading";
import { fullName, type Department, type Employee } from "@/lib/types";
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
import { Pencil, Search, Trash2, Users, X } from "lucide-react";

export type EmployeeFilter = {
  type: "advances" | "loans";
  /** employee_id -> total balance (summed across their active advances, or
   * their SSS + Pag-IBIG loans, whichever this filter is for). */
  balances: Record<string, number>;
};

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

function EmployeeRow({ employee: e, balance }: { employee: Employee; balance?: number }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <Link href={`/employees/${e.id}`} className="flex items-center gap-3 font-medium">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials(e)}
          </span>
          {fullName(e)}
        </Link>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {balance !== undefined ? formatPHP(balance) : (e.nickname ?? "—")}
      </td>
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
  );
}

function EmployeeCard({ employee: e, balance }: { employee: Employee; balance?: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Link href={`/employees/${e.id}`} className="flex flex-1 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(e)}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{fullName(e)}</div>
            <div className="text-xs text-muted-foreground">
              {balance !== undefined ? formatPHP(balance) : `${formatPHP(e.daily_wage)}/day`}
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
  );
}

export function EmployeeList({
  employees,
  departments,
  filter,
}: {
  employees: Employee[];
  departments: Department[];
  filter?: EmployeeFilter | null;
}) {
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

  const groups = useMemo(
    () => groupByDepartment(filtered, departments, { hideEmpty: query.trim().length > 0 || Boolean(filter) }),
    [filtered, departments, query, filter]
  );

  if (employees.length === 0 && !filter) {
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

  const filterLabel = filter?.type === "advances" ? "active advances" : "open loans";
  const balanceColumnLabel = filter?.type === "advances" ? "Advance balance" : "Loan balance";

  return (
    <div className="space-y-4">
      {filter && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
          <span>
            Showing only employees with <span className="font-medium">{filterLabel}</span>
          </span>
          <Link href="/employees" className="inline-flex items-center gap-1 text-primary hover:underline">
            <X className="h-3.5 w-3.5" /> Clear filter
          </Link>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or nickname…"
          className="pl-9"
        />
      </div>

      {employees.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No employees currently have {filterLabel}.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.department?.id ?? "none"} className="space-y-2">
            <DepartmentGroupHeading
              name={group.department?.name ?? "No department"}
              count={group.employees.length}
            />

            {/* Desktop table */}
            <Card className="hidden overflow-hidden md:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">{filter ? balanceColumnLabel : "Nickname"}</th>
                    <th className="px-4 py-3 font-medium">Daily wage</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.employees.map((e) => (
                    <EmployeeRow key={e.id} employee={e} balance={filter?.balances[e.id]} />
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {group.employees.map((e) => (
                <EmployeeCard key={e.id} employee={e} balance={filter?.balances[e.id]} />
              ))}
            </div>
          </div>
        ))
      )}

      {query.trim().length > 0 && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No employees match “{query}”.
        </p>
      )}
    </div>
  );
}
