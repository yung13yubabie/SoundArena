"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";
import { parseSunoShareUrl } from "@/lib/suno";

type ActionResult = { success: true } | { error: string };

const MAX_TITLE_LENGTH = 200;
const MAX_LYRICS_LENGTH = 30000;

export interface SunoShareInfo {
  sharerHandle: string;
  sharerDisplayName: string;
  avatarUrl: string | null;
  canonicalUrl: string;
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "error", message: "請先登入" };

  // 先檢查這是不是真正的 suno.com 網址,再抽 code——不然 https://evil.example/s/<真實
  // code> 這種網址,code 部分是真的,Suno API 一樣會驗證通過,但存進 DB、拿去顯示給
  // 別人點擊的卻是 evil.example,變成用「SoundArena 已驗證」包裝的釣魚連結。
  const parsed = parseSunoShareUrl(url);
  if (!parsed.ok) return { kind: "invalid" };

  // key 用 code(不是整個網址)——preflight 跟 submitEntry() 的伺服器端二次驗證
  // 驗的是同一個 code,不應該互相卡對方的冷卻時間。
  const { error: rateLimitError } = await supabase.rpc("check_suno_verify_rate_limit", { p_code: parsed.code });
  if (rateLimitError) return { kind: "error", message: "請求太頻繁，請稍等一下再試" };

  let response: Response;
  try {
    response = await fetch(`https://studio-api-prod.suno.com/api/share/code/${parsed.code}`, {
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
      canonicalUrl: parsed.canonicalUrl,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length > MAX_TITLE_LENGTH) return { error: `標題最長 ${MAX_TITLE_LENGTH} 字` };
  if (input.lyrics.length > MAX_LYRICS_LENGTH) return { error: `歌詞最長 ${MAX_LYRICS_LENGTH} 字` };

  // 不信任 client 傳來的 sharerHandle——資安複查發現舊版直接相信 client,攻擊者可以
  // 跳過 verifySunoSharer() 帶假身份送出投稿。這裡在伺服器端重新呼叫 Suno API 驗證一次。
  const verify = await verifySunoSharer(input.sunoShareUrl);
  if (verify.kind !== "ok") return { error: "Suno 分享連結驗證失敗，請確認連結正確" };

  const { data: registration } = await supabase
    .from("registrations")
    .select("suno_handle")
    .eq("id", input.registrationId)
    .maybeSingle();
  if (!registration || registration.suno_handle.toLowerCase() !== verify.info.sharerHandle.toLowerCase()) {
    return { error: "Suno 分享者帳號跟報名時填的帳號不符" };
  }

  const { error } = await supabase.rpc("submit_entry", {
    p_round_id: input.roundId,
    p_registration_id: input.registrationId,
    p_suno_share_url: verify.info.canonicalUrl,
    p_title: input.title,
    p_cover_image_url: input.coverImageUrl,
    p_sharer_handle: verify.info.sharerHandle,
    p_lyrics: input.lyrics,
    p_allow_public_playback: input.allowPublicPlayback,
  });

  if (error) {
    return {
      error: toFriendlyError(error, [{ test: (_m, c) => c === "23505", friendly: "這個輪次你已經投稿過了" }]),
    };
  }

  // 通知事件是附加動作,失敗不該讓投稿本身失敗(見 register/actions.ts 同樣的慣例)。
  try {
    if (user) {
      const [{ data: registration }, { data: round }] = await Promise.all([
        supabase.from("registrations").select("competition_id").eq("id", input.registrationId).maybeSingle(),
        supabase.from("rounds").select("name").eq("id", input.roundId).maybeSingle(),
      ]);
      if (registration) {
        await supabase.rpc("create_notification_event", {
          p_user_id: user.id,
          p_competition_id: registration.competition_id,
          p_event_type: "submission_confirmed",
          p_title: "投稿已送出",
          p_body: `「${input.title}」已送出到「${round?.name ?? "本輪"}」，狀態轉為待人工審核。`,
        });
      }
    }
  } catch {
    // 通知事件建立失敗不影響投稿本身已經成功
  }

  revalidatePath("/submit");
  revalidatePath("/status");
  return { success: true };
}
