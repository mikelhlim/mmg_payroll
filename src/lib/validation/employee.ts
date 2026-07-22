import { z } from "zod";

// Shared employee form schema — used by the client form (zodResolver) and
// re-validated server-side in the actions (defense in depth). Kept transform-
// free so the react-hook-form value type and the validated type are identical;
// empty optional strings are converted to null in the server action.

const text = z.string().trim().max(120);
const money = z
  .number({ message: "Enter a valid amount" })
  .min(0, "Must be zero or more")
  .max(9_999_999, "Too large");

export const employeeSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(120),
  last_name: z.string().trim().min(1, "Last name is required").max(120),
  middle_name: text,
  nickname: text,
  birthdate: z.string(), // yyyy-mm-dd or ""
  employment_date: z.string(),
  sss_number: text,
  philhealth_number: text,
  pagibig_number: text,
  daily_wage: money,
  overtime_fee: money,
  food_allowance_per_day: money,
  sleep_allowance_per_day: money,
  is_active: z.boolean(),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;

export const employeeDefaults: EmployeeInput = {
  first_name: "",
  last_name: "",
  middle_name: "",
  nickname: "",
  birthdate: "",
  employment_date: "",
  sss_number: "",
  philhealth_number: "",
  pagibig_number: "",
  daily_wage: 0,
  overtime_fee: 0,
  food_allowance_per_day: 0,
  sleep_allowance_per_day: 0,
  is_active: true,
};
