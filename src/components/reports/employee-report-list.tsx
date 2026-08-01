import Link from "next/link";
import { groupByDepartment } from "@/lib/departments";
import { DepartmentGroupHeading } from "@/components/department-group-heading";
import { displayName, type Department, type Employee } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Users } from "lucide-react";

function initials(e: Employee) {
  return `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase();
}

export function EmployeeReportList({
  employees,
  departments,
}: {
  employees: Employee[];
  departments: Department[];
}) {
  if (employees.length === 0) {
    return (
      <Card className="animate-rise">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-7 w-7" />
          </span>
          <p className="text-sm text-muted-foreground">No employees yet.</p>
        </CardContent>
      </Card>
    );
  }

  const groups = groupByDepartment(employees, departments, { hideEmpty: true });

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.department?.id ?? "none"} className="space-y-2">
          <DepartmentGroupHeading
            name={g.department?.name ?? "No department"}
            count={g.employees.length}
          />
          <div className="grid gap-3">
            {g.employees.map((e) => (
              <Link key={e.id} href={`/reports/${e.id}`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(e)}
                    </span>
                    <p className="flex-1 truncate font-medium">{displayName(e)}</p>
                    {!e.is_active && <Badge variant="secondary">Inactive</Badge>}
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
