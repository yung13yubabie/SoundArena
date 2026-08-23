import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendDiscordDm } from "./discord";
import { sendEmail } from "./email";

// Vercel 系統環境變數,不用手動設定——正式網址(不含 https://),不管在哪個部署
// 觸發都能可靠連回正式站,見 Vercel 官方文件「System environment variables」。
function siteOrigin(): string {
  return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "soundarena.vercel.app"}`;
}

// 通知內文附上對應頁面連結,方便收到通知後直接點過去——報名成功導去投稿頁(下一步
// 動作),投稿成功導去進度頁。
function eventUrl(eventType: string, competitionId: string): string {
  const origin = siteOrigin();
  if (eventType === "registration_confirmed") return `${origin}/submit?competition=${competitionId}`;
  if (eventType === "submission_confirmed") return `${origin}/status`;
  return origin;
}

// SA-005 通知功能:notification_events 這張表(ADR-0009)本來就完整運作——事件何時
// 建立、要發給誰、走哪個管道都已經決定好,狀態預設 'pending'。這支函式是那份設計
// 一直缺的「sender」:把一筆 pending 事件真的送出去。
//
// 「沒有可用的送達目的地」(沒有連結 discord_user_id / 帳號沒有 email)視為永久失敗,
// 直接標 failed,不留給 cron 每天白重試;送出當下的 API 呼叫失敗(網路問題、Discord/
// Resend 暫時性錯誤)視為可能只是暫時的,維持 pending,交給 cron 明天重試。
export async function dispatchNotificationEvent(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { data: event } = await supabase
    .from("notification_events")
    .select("id, user_id, title, body, channel, status, event_type, competition_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || event.status !== "pending") return;

  const message = `**${event.title}**\n${event.body}\n\n${eventUrl(event.event_type, event.competition_id)}`;

  if (event.channel === "discord") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("discord_user_id")
      .eq("id", event.user_id)
      .maybeSingle();
    if (!profile?.discord_user_id) {
      await supabase.from("notification_events").update({ status: "failed" }).eq("id", eventId);
      return;
    }
    try {
      await sendDiscordDm(profile.discord_user_id, message);
    } catch (err) {
      console.error(`notification_events ${eventId} Discord 送出失敗,留給下次 cron 重試:`, err);
      return;
    }
  } else if (event.channel === "email") {
    const {
      data: { user: authUser },
    } = await supabase.auth.admin.getUserById(event.user_id);
    if (!authUser?.email) {
      await supabase.from("notification_events").update({ status: "failed" }).eq("id", eventId);
      return;
    }
    try {
      await sendEmail(authUser.email, event.title, `${event.body}\n\n${eventUrl(event.event_type, event.competition_id)}`);
    } catch (err) {
      console.error(`notification_events ${eventId} Email 送出失敗,留給下次 cron 重試:`, err);
      return;
    }
  } else {
    return;
  }

  await supabase.from("notification_events").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", eventId);
}
