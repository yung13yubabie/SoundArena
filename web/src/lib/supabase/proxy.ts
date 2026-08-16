import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages that SPEC.md 第2節 requires to be behind login (登入 → 報名 → 投稿).
// Everything else stays browsable while logged out (Discovery/公開比賽資訊).
const AUTH_REQUIRED_PATHS = ["/register"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and auth.getClaims() — a
  // simple mistake here can make it very hard to debug users being randomly
  // logged out. getClaims() (not getSession()) is what actually revalidates
  // the token against Supabase rather than trusting the cookie as-is.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const requiresAuth = AUTH_REQUIRED_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (requiresAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
