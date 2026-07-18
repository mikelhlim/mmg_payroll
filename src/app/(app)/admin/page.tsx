import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminPage } from "@/lib/auth-role";
import Link from "next/link";
import { UserManagement, type AdminUser } from "@/components/admin/user-management";
import { WipeData } from "@/components/admin/wipe-data";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, ScrollText } from "lucide-react";

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

      <Link href="/admin/logs">
        <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ScrollText className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">Transaction log</p>
              <p className="text-sm text-muted-foreground">
                Audit trail of every change, with local timestamps.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <UserManagement users={users} currentUserId={current?.id ?? ""} />
      <WipeData />
    </div>
  );
}
