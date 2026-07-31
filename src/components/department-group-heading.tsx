import { Badge } from "@/components/ui/badge";

/** Section heading for a department-grouped list — shared by every screen
 * that lists all employees (roster, employee list, period report) so the
 * label styling (and its size) stays in one place. */
export function DepartmentGroupHeading({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-lg font-semibold">{name}</h2>
      <Badge variant="secondary">
        {count} {count === 1 ? "employee" : "employees"}
      </Badge>
    </div>
  );
}
