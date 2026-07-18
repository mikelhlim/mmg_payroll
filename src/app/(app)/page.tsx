import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Users, Wallet, HandCoins, CalendarDays, ArrowRight, Sparkles } from "lucide-react";

async function safeCount(promise: PromiseLike<{ count: number | null; error: unknown }>) {
  try {
    const { count, error } = await promise;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [employeeCount, activeAdvanceCount, openLoanCount, finalizedPeriodCount] = await Promise.all([
    safeCount(supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true)),
    safeCount(supabase.from("advances").select("*", { count: "exact", head: true }).eq("is_active", true)),
    safeCount(supabase.from("loans").select("*", { count: "exact", head: true }).gt("current_balance", 0)),
    safeCount(
      supabase.from("payroll_periods").select("*", { count: "exact", head: true }).eq("status", "finalized")
    ),
  ]);

  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0];

  const stats = [
    { label: "Active employees", value: employeeCount, icon: Users, href: "/employees", tint: "text-primary bg-primary/10" },
    { label: "Active advances", value: activeAdvanceCount, icon: HandCoins, href: "/employees", tint: "text-chart-3 bg-chart-3/10" },
    { label: "Open loans", value: openLoanCount, icon: Wallet, href: "/employees", tint: "text-chart-5 bg-chart-5/10" },
    { label: "Payroll runs", value: finalizedPeriodCount, icon: CalendarDays, href: "/payroll", tint: "text-chart-2 bg-chart-2/10" },
  ];

  return (
    <div className="space-y-8">
      <div className="animate-rise">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Welcome back
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {firstName ? `Hi, ${firstName} 👋` : "Dashboard"}
        </h1>
        <p className="text-muted-foreground">Here&apos;s your payroll at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href, tint }, i) => (
          <Link key={label} href={href} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <CardContent className="flex flex-col gap-3 p-5">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-2xl font-bold tabular-nums">{value ?? "—"}</div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="animate-rise">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Manage employees
            </CardTitle>
            <CardDescription>
              Add and edit profiles, compensation, contributions, loans, and advances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/employees" className={buttonVariants()}>
              Go to employees <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="animate-rise">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" /> Run weekly payroll
            </CardTitle>
            <CardDescription>
              Compute net weekly pay employee-by-employee, then generate payslips.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/payroll" className={buttonVariants()}>
              Go to payroll <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {employeeCount === null && (
        <p className="text-sm text-muted-foreground">
          Tip: connect your Supabase project (run <code>supabase/schema.sql</code> and set{" "}
          <code>.env.local</code>) to see live figures here.
        </p>
      )}
    </div>
  );
}
