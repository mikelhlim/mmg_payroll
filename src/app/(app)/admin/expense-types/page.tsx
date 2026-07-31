import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth-role";
import { ExpenseTypeManagement } from "@/components/admin/expense-type-management";
import type { ExpenseCategory } from "@/lib/types";
import { ArrowLeft, Receipt } from "lucide-react";

export default async function ExpenseTypesPage() {
  const supabase = await createClient();
  await requireAdminPage(supabase);

  const { data: categoryRows } = await supabase
    .from("expense_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const categories = (categoryRows ?? []) as ExpenseCategory[];

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
          <Receipt className="h-7 w-7 text-primary" /> Expense Types
        </h1>
        <p className="text-muted-foreground">
          Create, rename, and reorder expense types. Order here is the processing order used on every
          new expense report.
        </p>
      </div>

      <ExpenseTypeManagement categories={categories} />
    </div>
  );
}
