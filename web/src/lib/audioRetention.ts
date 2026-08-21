import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRoundResults } from "@/lib/roundResults";

export interface AudioToClear {
  submissionId: string;
  audioObjectKey: string;
}

export interface RetentionPlan {
  ended: boolean;
  toClear: AudioToClear[];
}

// 排名判斷共用 getRoundResults()(跟 /results 公開頁、手動清理 Server Action
// 同一套邏輯,不要有第二份重算排名的程式碼),回傳的是「該清掉的清單」,不直接
// 動手清——呼叫端(手動觸發用 RPC 走權限檢查、cron 用 service_role 直接寫)
// 各自決定怎麼執行,這裡只負責算「誰該留、誰該清」。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function planAudioRetention(supabase: SupabaseClient<any>, competitionId: string): Promise<RetentionPlan> {
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, voting_closes_at")
    .eq("competition_id", competitionId)
    .order("round_index", { ascending: false })
    .limit(1);
  const finalRound = rounds?.[0];
  if (!finalRound || !finalRound.voting_closes_at || new Date(finalRound.voting_closes_at) > new Date()) {
    return { ended: false, toClear: [] };
  }

  const results = await getRoundResults(supabase, finalRound.id, competitionId);
  const top3SubmissionIds = new Set(
    [...results.ranking].sort((a, b) => b.total - a.total).slice(0, 3).map((r) => r.id),
  );

  const { data: finalSubs } = await supabase.from("submissions").select("id, registration_id").eq("round_id", finalRound.id);
  const keepRegistrationIds = new Set(
    (finalSubs ?? []).filter((s) => top3SubmissionIds.has(s.id)).map((s) => s.registration_id),
  );

  const { data: allSubs } = await supabase
    .from("submissions")
    .select("id, registration_id, audio_object_key, rounds!inner(competition_id)")
    .eq("rounds.competition_id", competitionId)
    .not("audio_object_key", "is", null);

  const toClear: AudioToClear[] = (allSubs ?? [])
    .filter((s) => !keepRegistrationIds.has(s.registration_id) && s.audio_object_key)
    .map((s) => ({ submissionId: s.id, audioObjectKey: s.audio_object_key as string }));

  return { ended: true, toClear };
}
