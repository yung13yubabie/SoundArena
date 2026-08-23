import "server-only";

// SA-005 通知功能:開發/測試階段用 Resend 內建的 onboarding@resend.dev 寄件位址,
// 不需要驗證網域——之後要換成正式網域(例如 no-reply@soundarena.com)只要改這個
// 常數,不用動呼叫端。
const FROM_ADDRESS = "SoundArena <onboarding@resend.dev>";

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, text }),
  });
  if (!response.ok) {
    throw new Error(`failed to send email: ${response.status} ${await response.text()}`);
  }
}
