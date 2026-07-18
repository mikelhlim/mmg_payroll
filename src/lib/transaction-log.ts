import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LogAction =
  | "create"
  | "update"
  | "delete"
  | "finalize"
  | "amend"
  | "reopen"
  | "wipe";

export type LogEntity =
  | "employee"
  | "advance"
  | "loan"
  | "payroll_period"
  | "payroll_entry"
  | "user"
  | "data";

/**
 * Best-effort audit log. Records every data mutation with the acting user and a
 * UTC timestamp (rendered in the viewer's local time by <LocalTime>). Never
 * throws — a logging failure must not break the underlying action.
 */
export async function logTransaction(
  supabase: SupabaseServerClient,
  entry: {
    action: LogAction;
    entity: LogEntity;
    entity_id?: string | null;
    summary: string;
    details?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("transaction_logs").insert({
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id ?? null,
      summary: entry.summary,
      details: entry.details ?? null,
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
    });
  } catch {
    // swallow — logging is best-effort
  }
}
