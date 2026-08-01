import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmployeeList } from "@/components/employees/employee-list";
import {
  AdvancesReportList,
  LoansReportList,
  type AdvanceReportRow,
  type LoanReportRow,
} from "@/components/employees/obligations-report-list";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
import type { Advance, Department, Employee, Loan } from "@/lib/types";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam } = await searchParams;
  const filterType = filterParam === "advances" || filterParam === "loans" ? filterParam : null;

  const supabase = await createClient();
  const { data: departmentRows } = await supabase
    .from("departments")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const departments = (departmentRows ?? []) as Department[];

  // "Active advances" / "Open loans" on the dashboard link here — list every
  // individual advance/loan record (not just an aggregated balance), so an
  // employee holding more than one shows each one separately.
  if (filterType === "advances") {
    const { data } = await supabase
      .from("advances")
      .select("*, employees(*)")
      .eq("is_active", true)
      .order("start_date", { ascending: true });

    const rows: AdvanceReportRow[] = (data ?? [])
      .filter((a) => a.employees)
      .map((a) => {
        const { employees, ...advance } = a as Advance & { employees: Employee };
        return {
          id: advance.id,
          label: advance.label,
          start_date: advance.start_date,
          total_advance: advance.total_advance,
          current_balance: advance.current_balance,
          employee: employees,
          department_id: employees.department_id,
          last_name: employees.last_name,
        };
      });
    const employeeCount = new Set(rows.map((r) => r.employee.id)).size;

    return (
      <div className="space-y-6">
        <div className="animate-rise">
          <Link
            href="/employees"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All employees
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Active Advances</h1>
          <p className="text-muted-foreground">
            {rows.length} active {rows.length === 1 ? "advance" : "advances"} across {employeeCount}{" "}
            {employeeCount === 1 ? "employee" : "employees"}
          </p>
        </div>
        <AdvancesReportList rows={rows} departments={departments} />
      </div>
    );
  }

  if (filterType === "loans") {
    const { data } = await supabase
      .from("loans")
      .select("*, employees(*)")
      .gt("current_balance", 0)
      .order("start_date", { ascending: true });

    const rows: LoanReportRow[] = (data ?? [])
      .filter((l) => l.employees)
      .map((l) => {
        const { employees, ...loan } = l as Loan & { employees: Employee };
        return {
          id: loan.id,
          loan_type: loan.loan_type,
          principal: loan.principal,
          current_balance: loan.current_balance,
          start_date: loan.start_date,
          employee: employees,
          department_id: employees.department_id,
          last_name: employees.last_name,
        };
      });
    const employeeCount = new Set(rows.map((r) => r.employee.id)).size;

    return (
      <div className="space-y-6">
        <div className="animate-rise">
          <Link
            href="/employees"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All employees
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Open Loans</h1>
          <p className="text-muted-foreground">
            {rows.length} open {rows.length === 1 ? "loan" : "loans"} across {employeeCount}{" "}
            {employeeCount === 1 ? "employee" : "employees"}
          </p>
        </div>
        <LoansReportList rows={rows} departments={departments} />
      </div>
    );
  }

  const { data } = await supabase
    .from("employees")
    .select("*")
    .order("is_active", { ascending: false })
    .order("last_name", { ascending: true });
  const employees = (data ?? []) as Employee[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-rise">
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">
            {employees.length} {employees.length === 1 ? "person" : "people"} on record
          </p>
        </div>
        <Link href="/employees/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" /> Add employee
        </Link>
      </div>
      <EmployeeList employees={employees} departments={departments} />
    </div>
  );
}
