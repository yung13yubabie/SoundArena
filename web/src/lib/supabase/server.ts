import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Especially important if using Fluid compute: don't put this client in a
// global variable. Always create a new client within each function that uses it.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore since the
            // proxy (src/proxy.ts) is responsible for refreshing sessions.
          }
        },
      },
    },
  );
}
