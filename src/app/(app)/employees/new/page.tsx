import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmployeeForm } from "@/components/employees/employee-form";
import type { Department } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export default async function NewEmployeePage() {
  const supabase = await createClient();
  const { data: departmentRows } = await supabase
    .from("departments")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const departments = (departmentRows ?? []) as Department[];

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <Link
          href="/employees"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to employees
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Add employee</h1>
        <p className="text-muted-foreground">Create a new employee profile.</p>
      </div>
      <EmployeeForm departments={departments} />
    </div>
  );
}
