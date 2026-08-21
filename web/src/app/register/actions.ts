"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseSunoHandle } from "@/lib/suno";
import { toFriendlyError } from "@/lib/actionError";

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
      error: toFriendlyError(error, [{ test: (_m, c) => c === "23505", friendly: "你已經報名過這場比賽了" }]),
    };
  }

  // 通知事件是報名成功之後的附加動作,失敗不該讓整個報名動作失敗(跟
  // auth/callback/route.ts 的 joinDiscordGuild() 是同一種「非致命附加動作」慣例)。
  // title/body 不再由這裡組字串傳過去——ADR-0015 第 4 項的完整修法:呼叫端只傳
  // event_type + resource_id,實際文案由 create_notification_event() 自己產生,
  // 呼叫端無法注入任意內容。
  try {
    await supabase.rpc("create_notification_event", {
      p_user_id: user.id,
      p_competition_id: competitionId,
      p_event_type: "registration_confirmed",
      p_resource_id: registration.id,
    });
  } catch {
    // 通知事件建立失敗不影響報名本身已經成功
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
      ]),
    };
  }

  revalidatePath("/register");
  revalidatePath("/status");
  return { success: true };
}
