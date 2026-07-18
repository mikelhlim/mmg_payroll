import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fullName, type Employee } from "@/lib/types";
import { FileText, ChevronRight } from "lucide-react";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("*")
    .order("is_active", { ascending: false })
    .order("last_name", { ascending: true });
  const employees = (data ?? []) as Employee[];

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Pick an employee to view their profile, balances, and payslip history.
        </p>
      </div>

      {employees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-7 w-7" />
            </span>
            <p className="text-sm text-muted-foreground">No employees yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {employees.map((e) => (
            <Link key={e.id} href={`/reports/${e.id}`}>
              <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {`${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{fullName(e)}</p>
                    {e.nickname && <p className="text-xs text-muted-foreground">“{e.nickname}”</p>}
                  </div>
                  {!e.is_active && <Badge variant="secondary">Inactive</Badge>}
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
