import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth-role";
import { DepartmentManagement } from "@/components/admin/department-management";
import type { Department, Employee } from "@/lib/types";
import { ArrowLeft, Building2 } from "lucide-react";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  await requireAdminPage(supabase);

  const [{ data: departmentRows }, { data: employeeRows }] = await Promise.all([
    supabase.from("departments").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from("employees").select("id, department_id"),
  ]);
  const departments = (departmentRows ?? []) as Department[];
  const employees = (employeeRows ?? []) as Pick<Employee, "id" | "department_id">[];

  const employeeCounts: Record<string, number> = {};
  for (const e of employees) {
    if (e.department_id) employeeCounts[e.department_id] = (employeeCounts[e.department_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Building2 className="h-7 w-7 text-primary" /> Departments
        </h1>
        <p className="text-muted-foreground">
          Create, rename, and reorder departments. Order here is the processing order used for the
          employee list and payroll runs.
        </p>
      </div>

      <DepartmentManagement departments={departments} employeeCounts={employeeCounts} />
    </div>
  );
}
