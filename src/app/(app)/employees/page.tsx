import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmployeeList } from "@/components/employees/employee-list";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Employee } from "@/lib/types";

export default async function EmployeesPage() {
  const supabase = await createClient();
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
      <EmployeeList employees={employees} />
    </div>
  );
}
