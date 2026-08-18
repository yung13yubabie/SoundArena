import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages that SPEC.md 第2節 requires to be behind login (登入 → 報名 → 投稿),
// plus role-specific screens (admin/judge). RLS is still the actual
// authorization boundary underneath — this is route-level UX, not the
// security layer.
const AUTH_REQUIRED_PATHS = ["/register", "/admin", "/judge", "/status", "/feedback", "/vote"];

// 「管理特定比賽」的頁面——完全沒主辦過、也不是任何比賽協作者的人不該打開一個空蕩蕩的
// 管理介面。刻意不含 /admin/format(開放平台任何人都能從這裡建立第一場比賽,見 ADR-0002)
// 跟 /admin/profile(設定主持人身分,想成為主辦人的人本來就該能到達)。
const COMPETITION_SCOPED_ADMIN_PATHS = ["/admin/review", "/admin/schedule", "/admin/collaborators", "/judge"];

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

  const isCompetitionScopedAdminPath = COMPETITION_SCOPED_ADMIN_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (user && isCompetitionScopedAdminPath) {
    const { data: hasAccess } = await supabase.rpc("has_any_competition_access");
    if (!hasAccess) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/format";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
