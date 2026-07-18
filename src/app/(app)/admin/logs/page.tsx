import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth-role";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/local-time";
import { ArrowLeft, ScrollText } from "lucide-react";

type Log = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string;
  actor_email: string | null;
  created_at: string;
};

const ACTION_STYLE: Record<string, string> = {
  create: "bg-success/10 text-success",
  update: "bg-chart-3/10 text-chart-3",
  delete: "bg-destructive/10 text-destructive",
  finalize: "bg-primary/10 text-primary",
  amend: "bg-warning/15 text-warning",
  reopen: "bg-warning/15 text-warning",
  wipe: "bg-destructive/10 text-destructive",
};

export default async function LogsPage() {
  const supabase = await createClient();
  await requireAdminPage(supabase);

  const { data } = await supabase
    .from("transaction_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  const logs = (data ?? []) as Log[];

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ScrollText className="h-7 w-7 text-primary" /> Transaction log
        </h1>
        <p className="text-muted-foreground">
          Every create, edit, amendment, and deletion — newest first, in your local time.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                    <th className="px-4 py-3 font-medium">By</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        <LocalTime iso={log.created_at} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={ACTION_STYLE[log.action] ?? "bg-muted text-muted-foreground"}
                          variant="secondary"
                        >
                          {log.action}
                        </Badge>
                        <span className="ml-2 text-xs text-muted-foreground">{log.entity}</span>
                      </td>
                      <td className="px-4 py-3">{log.summary}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {log.actor_email ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
