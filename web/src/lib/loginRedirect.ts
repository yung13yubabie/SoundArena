import { redirect } from "next/navigation";

// SA-013 資安複查發現:未登入被導去 /login 時,OAuth 完成後一律 redirect 回首頁,
// 使用者原本想去的頁面(例如報名某場比賽)就丟了,得重新找一次。這裡統一收斂
// 「導去登入前先記住 next」這個動作,避免每個頁面各自寫一份、容易漏。
export function redirectToLogin(next: string): never {
  redirect(`/login?next=${encodeURIComponent(next)}`);
}

// 只接受站內相對路徑,擋掉 `//evil.com`(protocol-relative)跟 `https://evil.com`
// 這種會被瀏覽器當成外部導向的格式——login 頁跟 auth/callback 都要用同一套規則,
// 抽成共用函式避免兩邊各自寫一份、標準不一致。
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}
