import { describe, expect, it } from "vitest";
import { sortEmployeesByDepartment, groupByDepartment } from "./departments";
import type { Department } from "./types";

const departments: Department[] = [
  { id: "d-b", name: "Buliran", sort_order: 1, created_at: "", updated_at: "" },
  { id: "d-f", name: "Foliage", sort_order: 2, created_at: "", updated_at: "" },
  { id: "d-a", name: "Anilao-Tagbakin", sort_order: 3, created_at: "", updated_at: "" },
];

type Person = { id: string; department_id: string | null; last_name: string };

const people: Person[] = [
  { id: "1", department_id: "d-f", last_name: "Zamora" },
  { id: "2", department_id: null, last_name: "Aquino" },
  { id: "3", department_id: "d-b", last_name: "Cruz" },
  { id: "4", department_id: "d-b", last_name: "Aquino" },
  { id: "5", department_id: "d-a", last_name: "Reyes" },
];

describe("sortEmployeesByDepartment", () => {
  it("orders by department sort_order, then last name within a department", () => {
    const sorted = sortEmployeesByDepartment(people, departments);
    expect(sorted.map((p) => p.id)).toEqual(["4", "3", "1", "5", "2"]);
  });

  it("sorts employees with no department last", () => {
    const sorted = sortEmployeesByDepartment(people, departments);
    expect(sorted.at(-1)?.department_id).toBeNull();
  });

  it("does not mutate the input array", () => {
    const copy = [...people];
    sortEmployeesByDepartment(people, departments);
    expect(people).toEqual(copy);
  });
});

describe("groupByDepartment", () => {
  it("buckets employees into department-ordered groups plus a trailing unassigned group", () => {
    const groups = groupByDepartment(people, departments);
    expect(groups.map((g) => g.department?.name ?? "none")).toEqual([
      "Buliran",
      "Foliage",
      "Anilao-Tagbakin",
      "none",
    ]);
    expect(groups[0].employees.map((p) => p.id)).toEqual(["4", "3"]);
    expect(groups.at(-1)?.employees.map((p) => p.id)).toEqual(["2"]);
  });

  it("hideEmpty drops departments with no employees, keeping non-empty ones", () => {
    const onePerson: Person[] = [{ id: "1", department_id: "d-f", last_name: "Zamora" }];
    const groups = groupByDepartment(onePerson, departments, { hideEmpty: true });
    expect(groups.map((g) => g.department?.name ?? "none")).toEqual(["Foliage"]);
  });

  it("hideEmpty also drops the unassigned bucket when it's empty", () => {
    const onePerson: Person[] = [{ id: "1", department_id: "d-f", last_name: "Zamora" }];
    const groups = groupByDepartment(onePerson, departments, { hideEmpty: true });
    expect(groups.some((g) => g.department === null)).toBe(false);
  });

  it("without hideEmpty, empty departments still appear", () => {
    const onePerson: Person[] = [{ id: "1", department_id: "d-f", last_name: "Zamora" }];
    const groups = groupByDepartment(onePerson, departments);
    expect(groups).toHaveLength(4);
    expect(groups.find((g) => g.department?.name === "Buliran")?.employees).toEqual([]);
  });
});
