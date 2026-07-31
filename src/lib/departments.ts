import type { Department } from "@/lib/types";

/** Employees with no department sort last; ties break by last name. */
export function sortEmployeesByDepartment<
  T extends { department_id: string | null; last_name: string },
>(employees: T[], departments: Pick<Department, "id" | "sort_order">[]): T[] {
  const orderById = new Map(departments.map((d) => [d.id, d.sort_order]));
  const rank = (e: T) =>
    e.department_id ? (orderById.get(e.department_id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  return [...employees].sort((a, b) => rank(a) - rank(b) || a.last_name.localeCompare(b.last_name));
}

export type DepartmentGroup<T> = { department: Department | null; employees: T[] };

/**
 * Group into per-department buckets in department order, plus a trailing
 * "no department" bucket. `hideEmpty` drops buckets with zero employees
 * (e.g. while a list is search-filtered, so empty section headers don't show).
 */
export function groupByDepartment<T extends { department_id: string | null; last_name: string }>(
  employees: T[],
  departments: Department[],
  opts: { hideEmpty?: boolean } = {}
): DepartmentGroup<T>[] {
  const sorted = sortEmployeesByDepartment(employees, departments);
  const byDept = new Map<string, T[]>();
  const unassigned: T[] = [];
  for (const e of sorted) {
    if (e.department_id) {
      const bucket = byDept.get(e.department_id);
      if (bucket) bucket.push(e);
      else byDept.set(e.department_id, [e]);
    } else {
      unassigned.push(e);
    }
  }
  const groups: DepartmentGroup<T>[] = [...departments]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((d) => ({ department: d, employees: byDept.get(d.id) ?? [] }))
    .filter((g) => !opts.hideEmpty || g.employees.length > 0);
  if (unassigned.length > 0 || !opts.hideEmpty) groups.push({ department: null, employees: unassigned });
  return groups;
}
