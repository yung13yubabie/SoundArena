"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export async function registerForCompetition(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const competitionId = String(formData.get("competition_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const sunoHandle = String(formData.get("suno_handle") ?? "").trim();
  if (!competitionId) return { error: "找不到要報名的比賽" };
  if (!displayName || !sunoHandle) return { error: "請填寫暱稱與 Suno 帳號" };

  const { error } = await supabase.from("registrations").insert({
    competition_id: competitionId,
    user_id: user.id,
    display_name: displayName,
    suno_handle: sunoHandle,
  });
  if (error) {
    if (error.code === "23505") return { error: "你已經報名過這場比賽了" };
    return { error: error.message };
  }

  // 通知事件是報名成功之後的附加動作,失敗不該讓整個報名動作失敗(跟
  // auth/callback/route.ts 的 joinDiscordGuild() 是同一種「非致命附加動作」慣例)。
  try {
    const { data: competition } = await supabase.from("competitions").select("name").eq("id", competitionId).maybeSingle();
    await supabase.rpc("create_notification_event", {
      p_user_id: user.id,
      p_competition_id: competitionId,
      p_event_type: "registration_confirmed",
      p_title: "報名成功",
      p_body: `已收到你對「${competition?.name ?? "這場比賽"}」的報名，等主辦人審核。`,
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
  if (error) return { error: error.message };
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
  const trimmedHandle = sunoHandle.trim();
  if (!trimmedName || !trimmedHandle) return { error: "請填寫暱稱與 Suno 帳號" };

  const { error } = await supabase.rpc("resubmit_registration", {
    p_registration_id: registrationId,
    p_display_name: trimmedName,
    p_suno_handle: trimmedHandle,
  });
  if (error) {
    const cooldownMatch = error.message.match(/resubmit cooldown: wait (\d+) seconds/);
    if (cooldownMatch) {
      const minutes = Math.ceil(Number(cooldownMatch[1]) / 60);
      return { error: `送出太頻繁，請等約 ${minutes} 分鐘後再重新送出` };
    }
    return { error: error.message };
  }

  revalidatePath("/register");
  revalidatePath("/status");
  return { success: true };
}
