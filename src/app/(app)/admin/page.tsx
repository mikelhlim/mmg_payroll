import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminPage } from "@/lib/auth-role";
import { UserManagement, type AdminUser } from "@/components/admin/user-management";
import { WipeData } from "@/components/admin/wipe-data";

export default async function AdminPage() {
  const supabase = await createClient();
  await requireAdminPage(supabase);

  const {
    data: { user: current },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });

  const users: AdminUser[] = (data?.users ?? [])
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      full_name: (u.user_metadata?.full_name as string | undefined) ?? "",
      role: (((u.app_metadata?.role as string | undefined) ?? "admin") === "staff"
        ? "staff"
        : "admin") as "admin" | "staff",
      created_at: u.created_at ?? "",
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="space-y-8">
      <div className="animate-rise">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">Manage back-office users and system data.</p>
      </div>

      <UserManagement users={users} currentUserId={current?.id ?? ""} />
      <WipeData />
    </div>
  );
}
