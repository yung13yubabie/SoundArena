"use server";

import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";

type ActionResult = { success: true } | { error: string };

const MAX_MESSAGE_LENGTH = 3000;

export async function submitFeedback(message: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "登入狀態已過期，請重新登入" };

  const trimmed = message.trim();
  if (!trimmed) return { error: "請填寫回饋內容" };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { error: `回饋內容最長 ${MAX_MESSAGE_LENGTH} 字` };

  const { error } = await supabase.from("feedback").insert({ user_id: user.id, message: trimmed });
  if (error) {
    return {
      error: toFriendlyError(error, [
        { test: (m) => m.includes("wait a moment before sending more feedback"), friendly: "送出太頻繁，請稍等一下再送" },
      ]),
    };
  }
  return { success: true };
}
