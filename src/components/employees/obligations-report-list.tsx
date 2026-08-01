import Link from "next/link";
import { groupByDepartment } from "@/lib/departments";
import { DepartmentGroupHeading } from "@/components/department-group-heading";
import { displayName, type Department, type Employee, type LoanType } from "@/lib/types";
import { formatPHP } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, HandCoins, Landmark, type LucideIcon } from "lucide-react";

const LOAN_LABELS: Record<LoanType, string> = { SSS: "SSS loan", PAGIBIG: "Pag-IBIG loan" };

function initials(e: Employee) {
  return `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase();
}

function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-7 w-7" />
        </span>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

// groupByDepartment keys off department_id/last_name at the top level — both
// row shapes below lift them from `.employee`, same pattern as PayslipRow's
// toSortable in payslip-document.tsx.

export type AdvanceReportRow = {
  id: string;
  label: string | null;
  start_date: string | null;
  total_advance: number;
  current_balance: number;
  employee: Employee;
  department_id: string | null;
  last_name: string;
};

export function AdvancesReportList({
  rows,
  departments,
}: {
  rows: AdvanceReportRow[];
  departments: Department[];
}) {
  if (rows.length === 0) {
    return <EmptyState icon={HandCoins} message="No active advances." />;
  }
  const groups = groupByDepartment(rows, departments, { hideEmpty: true });
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.department?.id ?? "none"} className="space-y-2">
          <DepartmentGroupHeading
            name={g.department?.name ?? "No department"}
            count={g.employees.length}
          />
          <div className="grid gap-3">
            {g.employees.map((r) => (
              <Link key={r.id} href={`/employees/${r.employee.id}`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(r.employee)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{displayName(r.employee)}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.label ?? "Advance"}
                        {r.start_date ? ` · since ${r.start_date}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatPHP(r.current_balance)}</p>
                      <p className="text-xs text-muted-foreground">of {formatPHP(r.total_advance)}</p>
                    </div>
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

export type LoanReportRow = {
  id: string;
  loan_type: LoanType;
  principal: number;
  current_balance: number;
  start_date: string | null;
  employee: Employee;
  department_id: string | null;
  last_name: string;
};

export function LoansReportList({
  rows,
  departments,
}: {
  rows: LoanReportRow[];
  departments: Department[];
}) {
  if (rows.length === 0) {
    return <EmptyState icon={Landmark} message="No open loans." />;
  }
  const groups = groupByDepartment(rows, departments, { hideEmpty: true });
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.department?.id ?? "none"} className="space-y-2">
          <DepartmentGroupHeading
            name={g.department?.name ?? "No department"}
            count={g.employees.length}
          />
          <div className="grid gap-3">
            {g.employees.map((r) => (
              <Link key={r.id} href={`/employees/${r.employee.id}`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(r.employee)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{displayName(r.employee)}</p>
                      <p className="text-xs text-muted-foreground">
                        {LOAN_LABELS[r.loan_type]}
                        {r.start_date ? ` · since ${r.start_date}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatPHP(r.current_balance)}</p>
                      <p className="text-xs text-muted-foreground">of {formatPHP(r.principal)}</p>
                    </div>
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
