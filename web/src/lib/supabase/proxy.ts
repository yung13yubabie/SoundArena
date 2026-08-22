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

  // DB-10 資安複查(第三方稽核報告第二輪):這裡是未登入攔截真正先發生的地方——
  // AUTH_REQUIRED_PATHS 涵蓋 /register、/admin、/judge、/status、/feedback、/vote,
  // 對這些路徑,這段 middleware 級的 redirect 一定跑在頁面元件(以及 SA-013 的
  // redirectToLogin() 呼叫)之前,所以真正決定 /login 網址長什麼樣的是這裡,不是
  // 頁面元件裡那層(那層對這些路徑事實上變成永遠到不了的 defense-in-depth,只有
  // /submit 這種不在 AUTH_REQUIRED_PATHS 清單裡的路徑才會真的用到頁面層那份)。
  // 原本直接 clone URL 只改 pathname,會把原始 query string 原封不動搬到 /login
  // 底下(例如 /login?competition=ABC),但 login 頁只讀 `next` 參數,於是這個
  // 目的地資訊就在這裡丟失了,OAuth 完成後永遠導回首頁——這裡改成正確組出
  // /login?next=<原始 path+search 的 URL 編碼>,格式跟 loginRedirect.ts 的
  // safeNextPath() 期待的一致。
  if (requiresAuth && !user) {
    const originalPath = request.nextUrl.pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(originalPath)}`;
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
