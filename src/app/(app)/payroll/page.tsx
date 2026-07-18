import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewPeriodDialog } from "@/components/payroll/new-period-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPeriod } from "@/lib/payroll/period";
import type { PayrollPeriod } from "@/lib/types";
import { CalendarDays, ChevronRight, Wallet } from "lucide-react";

export default async function PayrollPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("period_start", { ascending: false });
  const periods = (data ?? []) as PayrollPeriod[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-rise">
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Weekly payroll runs, newest first.</p>
        </div>
        <NewPeriodDialog />
      </div>

      {periods.length === 0 ? (
        <Card className="animate-rise">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Wallet className="h-7 w-7" />
            </span>
            <div>
              <p className="font-medium">No payroll runs yet</p>
              <p className="text-sm text-muted-foreground">
                Start a weekly run to compute everyone&apos;s net pay.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {periods.map((p) => (
            <Link key={p.id} href={`/payroll/${p.id}`}>
              <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{formatPeriod(p.period_start, p.period_end)}</p>
                    {p.note && <p className="text-sm text-muted-foreground">{p.note}</p>}
                  </div>
                  <Badge variant={p.status === "finalized" ? "default" : "secondary"}>
                    {p.status === "finalized" ? "Finalized" : "Draft"}
                  </Badge>
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
