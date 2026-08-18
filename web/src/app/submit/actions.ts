"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export interface SunoShareInfo {
  sharerHandle: string;
  sharerDisplayName: string;
  avatarUrl: string | null;
}

export type VerifySunoResult =
  | { kind: "ok"; info: SunoShareInfo }
  | { kind: "invalid" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

// 只能從伺服器呼叫——瀏覽器直接呼叫會被 CORS 擋(已驗證過的技術事實,見 HANDOFF.md)。
// 這支 API 只回傳分享者資訊(handle/display_name/avatar_url),不含作品標題——Suno 沒有
// 公開的「用 content_id 查標題」端點(這輪試過 /api/clip/、studio-api.suno.ai 等常見路徑
// 都不通),所以標題改成使用者自己輸入,不再假裝能自動帶出。
export async function verifySunoSharer(url: string): Promise<VerifySunoResult> {
  const code = (url.match(/\/s\/([A-Za-z0-9]+)/) || url.match(/[?&]sh=([A-Za-z0-9]+)/) || [])[1];
  if (!code) return { kind: "invalid" };

  let response: Response;
  try {
    response = await fetch(`https://studio-api-prod.suno.com/api/share/code/${code}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
  } catch {
    return { kind: "error", message: "無法連線到 Suno，請稍後再試" };
  }

  if (response.status === 404) return { kind: "not_found" };
  if (!response.ok) return { kind: "error", message: `Suno 回應異常（HTTP ${response.status}）` };

  const data = (await response.json()) as {
    success?: boolean;
    sharer_handle?: string;
    sharer_display_name?: string;
    sharer_avatar_url?: string;
  };

  if (!data.success || !data.sharer_handle) return { kind: "not_found" };

  return {
    kind: "ok",
    info: {
      sharerHandle: data.sharer_handle,
      sharerDisplayName: data.sharer_display_name ?? data.sharer_handle,
      avatarUrl: data.sharer_avatar_url ?? null,
    },
  };
}

export interface SubmitEntryInput {
  roundId: string;
  registrationId: string;
  sunoShareUrl: string;
  title: string;
  coverImageUrl: string | null;
  sharerHandle: string;
  lyrics: string;
  allowPublicPlayback: boolean;
}

export async function submitEntry(input: SubmitEntryInput): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("submissions").insert({
    round_id: input.roundId,
    registration_id: input.registrationId,
    suno_share_url: input.sunoShareUrl,
    title: input.title,
    cover_image_url: input.coverImageUrl,
    sharer_handle: input.sharerHandle,
    lyrics: input.lyrics,
    allow_public_playback: input.allowPublicPlayback,
    // 身份比對(verifySunoSharer)已經在呼叫這個 action 之前跑完並通過,直接進待審核。
    status: "pending_review",
  });

  if (error) {
    if (error.code === "23505") return { error: "這個輪次你已經投稿過了" };
    return { error: error.message };
  }

  revalidatePath("/submit");
  revalidatePath("/status");
  return { success: true };
}
