import { z } from "zod";

export const departmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const departmentDefaults: DepartmentInput = { name: "" };
