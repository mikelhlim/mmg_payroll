import "server-only";
import { redirect } from "next/navigation";
import type { createClient } from "@/lib/supabase/server";

// Back-office roles. There is no employee self-service in this app — every
// account is a staff member; admins additionally manage users and can wipe
// data. (Employee self-service is a future phase, see the spec.)
export type AppRole = "admin" | "staff";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// The initial bootstrap admin — and any account without an explicit role —
// is treated as admin. Every other account created through the app gets an
// explicit role in app_metadata, so this default only ever applies to the
// seeded admin.
export function roleFromAppMetadata(appMetadata: Record<string, unknown> | undefined): AppRole {
  return appMetadata?.role === "staff" ? "staff" : "admin";
}

export async function getCurrentRole(supabase: SupabaseServerClient): Promise<AppRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return roleFromAppMetadata(user?.app_metadata);
}

// Server-action guard: throws so the caller sees a clear error instead of a
// generic RLS-violation message. Defense in depth — RLS enforces the same
// rule at the database layer, and the service-role actions (user management,
// data wipe) have no RLS to fall back on, so this check is what guards them.
export async function assertAdmin(supabase: SupabaseServerClient): Promise<void> {
  const role = await getCurrentRole(supabase);
  if (role !== "admin") {
    throw new Error("Only admins can do this.");
  }
}

// For actions any signed-in back-office user (admin or staff) may take —
// managing employees, running payroll. Every page behind the proxy already
// requires auth; this mainly guards Server Actions invoked directly as POSTs.
export async function assertAuthenticated(supabase: SupabaseServerClient): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You must be signed in to do this.");
  }
}

// Page guard: redirects a non-admin away from an admin-only page entirely.
export async function requireAdminPage(supabase: SupabaseServerClient): Promise<void> {
  const role = await getCurrentRole(supabase);
  if (role !== "admin") {
    redirect("/");
  }
}
