"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { toFriendlyError } from "@/lib/actionError";
import { dispatchNotificationEvent } from "@/lib/notifications";

type ActionResult = { success: true } | { error: string };

const MAX_NOTE_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 1000;

// SA-012 追加需求:主辦人(或 review 權限協作者)直接對特定參賽者發 Discord/Email
// 訊息,不用透過平台管理員轉達。跟 register/actions.ts、submit/actions.ts 同一套
// 「立即嘗試發送,失敗留給每日 cron 兜底」模式(見 lib/notifications.ts)。
export async function sendMessageToParticipant(registrationId: string, message: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };
  if (message.trim().length === 0) return { error: "訊息不能是空的" };
  if (message.length > MAX_MESSAGE_LENGTH) return { error: `訊息最長 ${MAX_MESSAGE_LENGTH} 字` };

  const { data: eventId, error } = await supabase.rpc("create_organizer_message_event", {
    p_registration_id: registrationId,
    p_message: message.trim(),
  });
  if (error) {
    return {
      error: toFriendlyError(error, [
        { test: (m) => m.includes("no supported notification channel"), friendly: "這位參賽者的登入方式不支援收通知(目前只支援 Google/Discord 登入的使用者)" },
        { test: (m) => m.includes("disabled notifications"), friendly: "這位參賽者已經取消訂閱這場比賽的通知,無法發送" },
        { test: (m) => m.includes("please wait a moment"), friendly: "發送太頻繁，請稍等幾秒再試" },
      ]),
    };
  }

  // 立即嘗試發送是最佳努力,失敗留給每日 cron 兜底(dispatchNotificationEvent() 內部
  // 已經吞掉送出當下的 API 錯誤),這裡再包一層 try/catch 純粹防呆,不影響這個
  // action 本身回報成功——事件已經確實建立進 notification_events。
  if (eventId) {
    try {
      await dispatchNotificationEvent(createServiceClient(), eventId);
    } catch {
      // 見上方註解
    }
  }

  return { success: true };
}

export async function reviewSubmission(
  submissionId: string,
  status: "approved" | "rejected" | "pending_review",
  note?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };
  if (note && note.length > MAX_NOTE_LENGTH) return { error: `備註最長 ${MAX_NOTE_LENGTH} 字` };

  const { error } = await supabase.rpc("review_submission", {
    p_submission_id: submissionId,
    p_status: status,
    p_note: note?.trim() || null,
  });
  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/admin/review");
  revalidatePath("/status");
  return { success: true };
}

export async function reviewRegistration(
  registrationId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  if (note && note.length > MAX_NOTE_LENGTH) return { error: `備註最長 ${MAX_NOTE_LENGTH} 字` };

  const { error } = await supabase.rpc("review_registration", {
    p_registration_id: registrationId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/admin/review");
  revalidatePath("/status");
  revalidatePath("/register");
  return { success: true };
}
