import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

// nonce-based CSP(取代原本 next.config.ts 的 'unsafe-inline' 基準線)——每個請求
// 產生一次性的 nonce,只有帶對這個 nonce 的 script 才會被瀏覽器允許執行。這只在
// 動態渲染的頁面有效(見 login/page.tsx 的說明);這個 repo 幾乎所有頁面本來就是
// 動態渲染(ƒ),只有 /login 額外用 connection() 強制轉成動態。
//
// style-src 刻意沒有跟著 nonce 化,維持 'unsafe-inline'——CSP 的 nonce/hash
// 機制不適用於 inline style="" 屬性(只適用於 <style> 區塊跟 <link>),而這個
// repo 有真實在用的 inline style 屬性(Avatar.tsx 的動態背景色、VoteList.tsx
// 播放中邊框色、layout.tsx 的字型 CSS 變數)。真的要做 style-src nonce 化,
// 得把這幾處全部改寫成 CSS class,是額外的重構,先不做——CSS 注入本來就不能
// 執行任意 JS,风险等级跟 script-src 不是同一個量級,優先把 script-src 鎖緊。
function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://lh3.googleusercontent.com https://cdn.discordapp.com https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.backblazeb2.com https://studio-api-prod.suno.com",
    "frame-src https://www.youtube.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeader = buildCspHeader(nonce);

  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", cspHeader);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
