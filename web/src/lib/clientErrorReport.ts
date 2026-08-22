"use server";

// SA-012 觀測性缺口:client component 裡的 console.error 只會出現在使用者瀏覽器
// 的 devtools,PlatformAdmin(平台操作者)完全看不到、也不會知道發生過。這支
// Server Action 把同一個錯誤也記到伺服器端 console.error——Vercel 的 function log
// 會捕捉到,操作者至少有機會在 Vercel dashboard 發現。不是完整的錯誤追蹤系統
// (沒有專屬 dashboard、沒有主動 alert,那需要外部服務或已擱置的 Discord/Resend
// 整合),只是把「原本完全看不到」變成「至少進得了現有的伺服器 log」。
export async function reportClientError(context: string, message: string): Promise<void> {
  console.error(`[client-error] ${context}: ${message}`);
}
