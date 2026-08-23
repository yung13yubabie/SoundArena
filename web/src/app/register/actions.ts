"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseSunoHandle } from "@/lib/suno";
import { toFriendlyError } from "@/lib/actionError";
import { dispatchNotificationEvent } from "@/lib/notifications";
import { grantDiscordChannelAccess } from "@/lib/discord";

type ActionResult = { success: true } | { error: string };

const MAX_DISPLAY_NAME_LENGTH = 60;

export async function registerForCompetition(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const competitionId = String(formData.get("competition_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const rawSunoHandle = String(formData.get("suno_handle") ?? "");
  if (!competitionId) return { error: "找不到要報名的比賽" };
  if (!displayName) return { error: "請填寫暱稱" };
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) return { error: `暱稱最長 ${MAX_DISPLAY_NAME_LENGTH} 字` };

  const parsed = parseSunoHandle(rawSunoHandle);
  if (!parsed.ok) return { error: parsed.error };

  const { data: registration, error } = await supabase
    .from("registrations")
    .insert({
      competition_id: competitionId,
      user_id: user.id,
      display_name: displayName,
      suno_handle: parsed.handle,
    })
    .select("id")
    .single();
  if (error) {
    return {
      error: toFriendlyError(error, [
        { test: (_m, c) => c === "23505", friendly: "你已經報名過這場比賽了" },
        { test: (_m, c) => c === "42501", friendly: "報名尚未開放或已經截止" },
      ]),
    };
  }

  // 通知事件是報名成功之後的附加動作,失敗不該讓整個報名動作失敗(跟
  // auth/callback/route.ts 的 joinDiscordGuild() 是同一種「非致命附加動作」慣例)。
  // title/body 不再由這裡組字串傳過去——ADR-0015 第 4 項的完整修法:呼叫端只傳
  // event_type + resource_id,實際文案由 create_notification_event() 自己產生,
  // 呼叫端無法注入任意內容。
  //
  // SA-005:事件建立後立即嘗試送出(Vercel Hobby 方案 cron 一天只能跑一次,純靠
  // cron 兜底的話通知可能要等將近一天才送到)——這裡是最佳努力,失敗了事件還在
  // notification_events 保持 pending,交給每日 cron(dispatch-notifications)重試。
  try {
    const { data: eventId } = await supabase.rpc("create_notification_event", {
      p_user_id: user.id,
      p_competition_id: competitionId,
      p_event_type: "registration_confirmed",
      p_resource_id: registration.id,
    });
    if (eventId) await dispatchNotificationEvent(createServiceClient(), eventId);
  } catch {
    // 通知事件建立/送出失敗不影響報名本身已經成功
  }

  // 報名成功後自動加入這場比賽的 Discord 頻道(最佳努力,失敗不影響報名成功)——
  // 只有 Discord 登入且比賽有開頻道的人適用,Google 登入的人自然沒有 discord_user_id,
  // 安靜跳過。
  try {
    const service = createServiceClient();
    const [{ data: competition }, { data: profile }] = await Promise.all([
      service.from("competitions").select("discord_channel_id").eq("id", competitionId).maybeSingle(),
      service.from("profiles").select("discord_user_id").eq("id", user.id).maybeSingle(),
    ]);
    if (competition?.discord_channel_id && profile?.discord_user_id) {
      await grantDiscordChannelAccess(competition.discord_channel_id, profile.discord_user_id);
    }
  } catch {
    // Discord 頻道加入失敗不影響報名本身已經成功
  }

  revalidatePath("/register");
  revalidatePath("/status");
  return { success: true };
}

export async function setRegistrationNotifications(registrationId: string, enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_registration_notifications", {
    p_registration_id: registrationId,
    p_enabled: enabled,
  });
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/status");
  return { success: true };
}

export async function resubmitRegistration(
  registrationId: string,
  displayName: string,
  sunoHandle: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const trimmedName = displayName.trim();
  if (!trimmedName) return { error: "請填寫暱稱" };
  if (trimmedName.length > MAX_DISPLAY_NAME_LENGTH) return { error: `暱稱最長 ${MAX_DISPLAY_NAME_LENGTH} 字` };

  const parsed = parseSunoHandle(sunoHandle);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase.rpc("resubmit_registration", {
    p_registration_id: registrationId,
    p_display_name: trimmedName,
    p_suno_handle: parsed.handle,
  });
  if (error) {
    return {
      error: toFriendlyError(error, [
        {
          test: (m) => /resubmit cooldown: wait (\d+) seconds/.test(m),
          friendly: (() => {
            const match = error.message.match(/resubmit cooldown: wait (\d+) seconds/);
            const minutes = match ? Math.ceil(Number(match[1]) / 60) : 1;
            return `送出太頻繁，請等約 ${minutes} 分鐘後再重新送出`;
          })(),
        },
        { test: (m) => m.includes("registration window is closed"), friendly: "報名尚未開放或已經截止" },
      ]),
    };
  }

  revalidatePath("/register");
  revalidatePath("/status");
  return { success: true };
}
