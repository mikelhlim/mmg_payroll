import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";
import { roleFromAppMetadata } from "@/lib/auth-role";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleFromAppMetadata(user?.app_metadata);

  return (
    <div className="flex min-h-screen flex-col">
      <Nav isAdmin={role === "admin"} userEmail={user?.email ?? null} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:pb-8">{children}</main>
    </div>
  );
}
