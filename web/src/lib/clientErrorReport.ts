"use server";

import { createClient } from "@/lib/supabase/server";

// SA-012 觀測性缺口:client component 裡的 console.error 只會出現在使用者瀏覽器
// 的 devtools,PlatformAdmin(平台操作者)完全看不到、也不會知道發生過。這支
// Server Action 把同一個錯誤也記到伺服器端 console.error——Vercel 的 function log
// 會捕捉到,操作者至少有機會在 Vercel dashboard 發現。不是完整的錯誤追蹤系統
// (沒有專屬 dashboard、沒有主動 alert,那需要外部服務或已擱置的 Discord/Resend
// 整合),只是把「原本完全看不到」變成「至少進得了現有的伺服器 log」。
//
// DB-15 資安複查(第三方稽核報告第二輪):這支 Server Action 原本沒有任何輸入
// 邊界——理論上任何人都能拿 context/message 亂填,把它當成免費的 log 灌水管道。
// 補上:context 白名單(只接受目前真的在用的呼叫點)、message 長度上限、去除
// 換行/控制字元(防止偽造多行假日誌混進真實 log)、要求已登入、極簡的每人每分鐘
// 節流。

const ALLOWED_CONTEXTS = new Set([
  "AdminShell.loadPlatformCompetitions",
  "AdminShell.loadOrganizers",
  "AdminShell.loadFeedback",
]);

const MAX_MESSAGE_LENGTH = 1000;

function sanitize(input: string): string {
  return input.replace(/[\r\n\x00-\x1f\x7f]/g, " ").slice(0, MAX_MESSAGE_LENGTH);
}

// 極簡的每人每分鐘節流,不追求精確——目的只是防止單一使用者洗爆 log,不是正式
// rate-limit 基礎設施。用記憶體 Map,Vercel serverless 環境下每個 instance 各自
// 維護、重開就清空,對「防濫用噪音」這個等級的需求已經足夠。
const callTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 10;

export async function reportClientError(context: string, message: string): Promise<void> {
  if (!ALLOWED_CONTEXTS.has(context)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const now = Date.now();
  const recent = (callTimestamps.get(user.id) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_CALLS) return;
  recent.push(now);
  callTimestamps.set(user.id, recent);

  console.error(`[client-error] ${context} (user=${user.id}): ${sanitize(message)}`);
}
