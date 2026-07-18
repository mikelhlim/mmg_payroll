"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/auth-role";
import { logTransaction } from "@/lib/transaction-log";

type Result = { error: string } | { ok: true };

const CreateUserSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().trim().max(120),
  role: z.enum(["admin", "staff"]),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export async function createUser(raw: CreateUserInput): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);

  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
    app_metadata: { role: v.role, must_change_password: true },
    user_metadata: { full_name: v.full_name || v.email },
  });
  if (error) {
    if (/already/i.test(error.message)) return { error: "A user with this email already exists." };
    return { error: error.message };
  }

  await logTransaction(supabase, {
    action: "create",
    entity: "user",
    summary: `Created ${v.role} user ${v.email}`,
  });

  revalidatePath("/admin");
  return { ok: true };
}

export async function updateUserRole(userId: string, role: "admin" | "staff"): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === userId && role !== "admin") {
    return { error: "You can't remove your own admin access." };
  }

  const admin = createAdminClient();
  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !existing.user) return { error: getErr?.message ?? "User not found." };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...existing.user.app_metadata, role },
  });
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "update",
    entity: "user",
    entity_id: userId,
    summary: `Changed ${existing.user.email} role to ${role}`,
  });

  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteUser(userId: string): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === userId) return { error: "You can't delete your own account." };

  const admin = createAdminClient();
  const { data: target } = await admin.auth.admin.getUserById(userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  await logTransaction(supabase, {
    action: "delete",
    entity: "user",
    entity_id: userId,
    summary: `Deleted user ${target?.user?.email ?? userId}`,
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Delete ALL domain data (employees, payroll, advances, loans) via the
 * SECURITY DEFINER RPC, then remove every non-admin auth user. Admin accounts
 * are preserved.
 */
export async function wipeAllData(): Promise<Result> {
  const supabase = await createClient();
  await assertAdmin(supabase);

  const { error: rpcError } = await supabase.rpc("admin_wipe_all_data");
  if (rpcError) return { error: rpcError.message };

  await logTransaction(supabase, {
    action: "wipe",
    entity: "data",
    summary: "Deleted all data (employees, payroll, advances, loans, non-admin users)",
  });

  // Remove non-admin (staff) auth users; keep all admins.
  const admin = createAdminClient();
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) return { error: listErr.message };

  for (const u of list.users) {
    const role = (u.app_metadata?.role as string | undefined) ?? "admin";
    if (role !== "admin") {
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
