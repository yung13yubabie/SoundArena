"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { toFriendlyError } from "@/lib/actionError";
import { parseSunoShareUrl } from "@/lib/suno";
import { createUploadUrl, deleteAudioObject, getObjectHeadBytes } from "@/lib/storage";
import { ALLOWED_AUDIO_TYPES, MAX_AUDIO_FILE_SIZE, matchesAudioMagicBytes } from "@/lib/audioUpload";

type ActionResult = { success: true } | { error: string };

const MAX_TITLE_LENGTH = 200;
const MAX_LYRICS_LENGTH = 30000;
const MAX_PROCESS_DOC_LENGTH = 20000;

// SA-003 剩餘項目:24 小時內同一筆報名最多申請這麼多次 upload URL(不含已經被
// 投稿吃掉的)——核發 URL 本身幾乎零成本,真正的風險是有人重複申請卻從不真的
// 送出投稿,累積一堆孤兒物件。這個上限只是擋濫用,正常使用者調整/重傳幾次
// 完全不會撞到。
const MAX_PENDING_UPLOADS_PER_DAY = 20;

export type RequestAudioUploadResult = { success: true; uploadUrl: string; objectKey: string } | { error: string };

export async function requestAudioUpload(
  registrationId: string,
  contentType: string,
  fileSize: number,
): Promise<RequestAudioUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const extension = ALLOWED_AUDIO_TYPES[contentType];
  if (!extension) return { error: "檔案格式不支援，請上傳 mp3/wav/m4a/ogg/flac" };
  if (fileSize > MAX_AUDIO_FILE_SIZE) return { error: `檔案太大，最大 ${Math.floor(MAX_AUDIO_FILE_SIZE / 1024 / 1024)}MB` };

  const { data: registration } = await supabase
    .from("registrations")
    .select("id")
    .eq("id", registrationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!registration) return { error: "找不到這筆報名" };

  const { count } = await supabase
    .from("pending_uploads")
    .select("id", { count: "exact", head: true })
    .eq("registration_id", registrationId)
    .is("consumed_at", null)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= MAX_PENDING_UPLOADS_PER_DAY) {
    return { error: "上傳請求太頻繁，請稍後再試" };
  }

  const objectKey = `submissions/${registrationId}/${randomUUID()}.${extension}`;
  const uploadUrl = await createUploadUrl(objectKey, contentType, fileSize);

  const { error: trackError } = await supabase
    .from("pending_uploads")
    .insert({ registration_id: registrationId, object_key: objectKey, content_type: contentType, declared_size: fileSize });
  if (trackError) return { error: "建立上傳請求失敗，請稍後再試" };

  return { success: true, uploadUrl, objectKey };
}

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
  audioObjectKey: string | null;
  processDoc: string;
  ethicalSourcingDeclared: boolean;
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
  if (input.processDoc.length > MAX_PROCESS_DOC_LENGTH) return { error: `創作過程說明最長 ${MAX_PROCESS_DOC_LENGTH} 字` };

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

  // SA-003 剩餘項目:contentType header 已經綁進上傳簽章不能偽造(ADR-0023),但實際
  // byte 內容可能根本不是那個格式。投稿當下(不是上傳當下)才做這個檢查,因為投稿
  // 才是「這個檔案真的要被使用」的時間點——只查開頭幾十個 bytes,不用整個下載。
  if (input.audioObjectKey) {
    const { data: pendingUpload } = await supabase
      .from("pending_uploads")
      .select("content_type")
      .eq("object_key", input.audioObjectKey)
      .maybeSingle();
    if (!pendingUpload) return { error: "找不到這個上傳紀錄，請重新上傳音檔" };

    const headBytes = await getObjectHeadBytes(input.audioObjectKey);
    if (!matchesAudioMagicBytes(headBytes, pendingUpload.content_type)) {
      await deleteAudioObject(input.audioObjectKey).catch(() => {});
      return { error: "上傳的檔案內容看起來不是有效的音訊格式，請確認檔案沒有損壞" };
    }
  }

  // DB-02 資安複查:submit_entry() 原本 grant 給 authenticated,代表任何人都能跳過
  // 上面這段 Suno API 重新驗證 + magic bytes 檢查,直接對 PostgREST 打這支 RPC——
  // DB 那層只驗證得到字串/格式層級的東西,驗證不到「這個連結真的是這個人分享的」
  // 「這個檔案真的是音訊」。現在這支 RPC 只留給 service_role,唯一合法呼叫路徑
  // 就是這裡——已經完成上面兩層外部驗證之後才呼叫,並且明確傳入剛剛用使用者
  // session 驗證過的 user.id(不能讓 RPC 依賴 auth.uid(),service_role 呼叫下
  // auth.uid() 會是 null)。
  const serviceClient = createServiceClient();
  const { data: submissionId, error } = await serviceClient.rpc("submit_entry", {
    p_round_id: input.roundId,
    p_registration_id: input.registrationId,
    p_caller_user_id: user.id,
    p_suno_share_url: verify.info.canonicalUrl,
    p_title: input.title,
    p_cover_image_url: input.coverImageUrl,
    p_sharer_handle: verify.info.sharerHandle,
    p_lyrics: input.lyrics,
    p_allow_public_playback: input.allowPublicPlayback,
    p_audio_object_key: input.audioObjectKey,
    p_process_doc: input.processDoc.trim() || null,
    p_ethical_sourcing_declared: input.ethicalSourcingDeclared,
  });

  if (error) {
    return {
      error: toFriendlyError(error, [
        { test: (_m, c) => c === "23505", friendly: "這個輪次你已經投稿過了" },
        { test: (m) => m.includes("submissions have not opened yet"), friendly: "這一輪還沒開放投稿" },
        { test: (m) => m.includes("submission window has closed"), friendly: "這一輪投稿已經截止" },
      ]),
    };
  }

  // 通知事件是附加動作,失敗不該讓投稿本身失敗(見 register/actions.ts 同樣的慣例)。
  // title/body 不再由這裡組字串傳過去,見 register/actions.ts 同一處的說明。
  try {
    if (user && submissionId) {
      const { data: registration } = await supabase
        .from("registrations")
        .select("competition_id")
        .eq("id", input.registrationId)
        .maybeSingle();
      if (registration) {
        await supabase.rpc("create_notification_event", {
          p_user_id: user.id,
          p_competition_id: registration.competition_id,
          p_event_type: "submission_confirmed",
          p_resource_id: submissionId,
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

// 投票還沒開始前,投稿者可以刪除重新上傳——投票一旦開始就不給刪(delete_own_submission()
// RPC 會擋),避免已經投出去的票因為 cascade 被默默清掉。
export async function deleteMySubmission(submissionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { data: audioObjectKey, error } = await supabase.rpc("delete_own_submission", {
    p_submission_id: submissionId,
  });
  if (error) {
    return {
      error: toFriendlyError(error, [
        { test: (m) => m.includes("voting has already opened"), friendly: "這一輪投票已經開始，無法刪除投稿" },
        { test: (m) => m.includes("not your submission"), friendly: "這不是你的投稿" },
      ]),
    };
  }

  if (audioObjectKey) {
    try {
      await deleteAudioObject(audioObjectKey);
    } catch {
      // B2 檔案沒刪成功不影響投稿本身已經被刪除——不留孤兒 DB 資料比不留孤兒檔案重要。
    }
  }

  revalidatePath("/status");
  revalidatePath("/submit");
  return { success: true };
}
