import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmployeeForm } from "@/components/employees/employee-form";
import { LoansCard } from "@/components/employees/loans-card";
import { AdvancesCard } from "@/components/employees/advances-card";
import { buttonVariants } from "@/components/ui/button";
import { fullName, type Advance, type Employee, type Loan } from "@/lib/types";
import { ArrowLeft, FileText } from "lucide-react";

export default async function EmployeeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: employeeRow }, { data: loanRows }, { data: advanceRows }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).maybeSingle(),
    supabase.from("loans").select("*").eq("employee_id", id),
    supabase
      .from("advances")
      .select("*")
      .eq("employee_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!employeeRow) notFound();
  const employee = employeeRow as Employee;
  const loans = (loanRows ?? []) as Loan[];
  const advances = (advanceRows ?? []) as Advance[];

  return (
    <div className="space-y-6">
      <div className="animate-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/employees"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to employees
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{fullName(employee)}</h1>
          <p className="text-muted-foreground">
            {employee.nickname ? `“${employee.nickname}” · ` : ""}Profile, compensation, loans &amp;
            advances
          </p>
        </div>
        <Link
          href={`/reports/${employee.id}`}
          className={buttonVariants({ variant: "outline" })}
        >
          <FileText className="h-4 w-4" /> View report
        </Link>
      </div>

      <EmployeeForm employee={employee} />

      <div className="grid gap-6 lg:grid-cols-2">
        <LoansCard employeeId={employee.id} loans={loans} />
        <AdvancesCard employeeId={employee.id} advances={advances} />
      </div>
    </div>
  );
}
