import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS and can manage auth users.
 * Never import this from a "use client" file or a component; the
 * `server-only` import throws a build error if that ever happens, since the
 * service role key must never reach the browser bundle.
 *
 * Used by: user management (add/edit/delete users), the admin bootstrap
 * seed, and the "delete all data except admin" wipe.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (Supabase Dashboard → Project Settings → API) to manage users."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
