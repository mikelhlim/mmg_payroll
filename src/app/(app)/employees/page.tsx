import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmployeeList, type EmployeeFilter } from "@/components/employees/employee-list";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Department, Employee } from "@/lib/types";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam } = await searchParams;
  const filterType = filterParam === "advances" || filterParam === "loans" ? filterParam : null;

  const supabase = await createClient();
  const [{ data }, { data: departmentRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("*")
      .order("is_active", { ascending: false })
      .order("last_name", { ascending: true }),
    supabase
      .from("departments")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  const allEmployees = (data ?? []) as Employee[];
  const departments = (departmentRows ?? []) as Department[];

  // "Active advances" / "Open loans" on the dashboard link here — narrow the
  // roster down to just the affected employees, with each one's balance.
  let employees = allEmployees;
  let filter: EmployeeFilter | null = null;
  if (filterType) {
    const balances = new Map<string, number>();
    if (filterType === "advances") {
      const { data: advanceRows } = await supabase
        .from("advances")
        .select("employee_id, current_balance")
        .eq("is_active", true);
      for (const a of advanceRows ?? []) {
        balances.set(a.employee_id, (balances.get(a.employee_id) ?? 0) + a.current_balance);
      }
    } else {
      const { data: loanRows } = await supabase
        .from("loans")
        .select("employee_id, current_balance")
        .gt("current_balance", 0);
      for (const l of loanRows ?? []) {
        balances.set(l.employee_id, (balances.get(l.employee_id) ?? 0) + l.current_balance);
      }
    }
    employees = allEmployees.filter((e) => balances.has(e.id));
    filter = { type: filterType, balances: Object.fromEntries(balances) };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-rise">
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">
            {filter
              ? `${employees.length} ${employees.length === 1 ? "person" : "people"} with ${
                  filter.type === "advances" ? "active advances" : "open loans"
                }`
              : `${employees.length} ${employees.length === 1 ? "person" : "people"} on record`}
          </p>
        </div>
        <Link href="/employees/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" /> Add employee
        </Link>
      </div>
      <EmployeeList employees={employees} departments={departments} filter={filter} />
    </div>
  );
}
