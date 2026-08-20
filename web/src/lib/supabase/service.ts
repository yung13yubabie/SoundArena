import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service_role bypasses RLS entirely — only use for writes where the trust
// boundary genuinely cannot live in Postgres (see docs/adr/0012). Never
// expose this client or its key to the browser.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
