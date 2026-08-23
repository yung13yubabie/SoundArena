"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";
import { dispatchPendingTeamNotifications } from "@/lib/notifications";
import { computeRanking } from "@/lib/ranking";
import { getJudgeScoringData } from "@/lib/judgeScoring";

type ActionResult = { success: true } | { error: string };

// SA-007 修復:改走 save_submission_score() RPC,不再直接 upsert submission_scores——
// RPC 內部會驗證 scoreItemId 真的屬於這個 submission 適用的 scoring_rule,不像舊版
// 只靠 RLS 檢查「你能不能評這個 submission 所屬的比賽」,擋不住塞別的 scoring_rule
// 底下的 score_item_id 進來污染資料。
export async function saveScore(submissionId: string, scoreItemId: string, rawValue: number): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { error } = await supabase.rpc("save_submission_score", {
    p_submission_id: submissionId,
    p_score_item_id: scoreItemId,
    p_raw_value: rawValue,
  });
  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/judge");
  return { success: true };
}

export async function setEliminated(
  registrationId: string,
  roundId: string,
  eliminated: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_registration_eliminated", {
    p_registration_id: registrationId,
    p_round_id: roundId,
    p_eliminated: eliminated,
  });
  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/judge");
  revalidatePath("/status");
  return { success: true };
}

// 確認本輪結果——這是團隊分組(下一輪若為隊伍賽)真正等待的訊號,不能用
// voting_closes_at 代替,因為投票截止到主辦人實際標完淘汰名單之間有空窗期。
//
// grilling 確認的設計轉向:淘汰改成通用的自動機制,不再是純人工點選——每輪的
// elimination_percent 是這輪要淘汰的百分比(未設定就完全不自動淘汰,維持手動)。
// 排名計算在這裡做(重用 lib/ranking.ts,跟 /judge 畫面、/results 公開結果頁
// 同一份公式),算好淘汰名單才傳給 finalize_round_results() RPC——RPC 只負責
// 驗證/套用/鎖定,不重算排名,避免兩邊算法各自漂移。
export async function finalizeRoundResults(roundId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: round } = await supabase
    .from("rounds")
    .select("competition_id, elimination_percent")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return { error: "找不到這個輪次" };

  let eliminateIds: string[] = [];
  if (round.elimination_percent && round.elimination_percent > 0) {
    const [{ data: activeRegs }, { scoreItems, submissions }] = await Promise.all([
      supabase.from("registrations").select("id").eq("competition_id", round.competition_id).eq("status", "active"),
      getJudgeScoringData(supabase, round.competition_id, roundId),
    ]);

    const activeIds = (activeRegs ?? []).map((r) => r.id);
    const ranking = computeRanking(
      scoreItems,
      submissions.map((s) => ({ id: s.registrationId, values: s.values })),
    );
    const totalByRegistration = new Map(ranking.map((r) => [r.id, r.total]));

    // 這輪沒投稿的 active 報名者視為 0 分、排在墊底——報名截止時他們本來就有機會
    // 投稿卻沒投,承擔被淘汰的風險是合理的,不用另外設計特殊豁免規則。同分時用
    // registration_id 排序當穩定 tiebreak,結果不會每次重算就不一樣。
    const sorted = [...activeIds].sort((a, b) => {
      const totalA = totalByRegistration.get(a) ?? 0;
      const totalB = totalByRegistration.get(b) ?? 0;
      if (totalA !== totalB) return totalA - totalB;
      return a < b ? -1 : a > b ? 1 : 0;
    });

    const eliminateCount = Math.floor((round.elimination_percent / 100) * activeIds.length);
    eliminateIds = sorted.slice(0, eliminateCount);
  }

  const { error } = await supabase.rpc("finalize_round_results", {
    p_round_id: roundId,
    p_eliminate_registration_ids: eliminateIds,
  });
  if (error) return { error: toFriendlyError(error) };

  try {
    await supabase.rpc("check_and_form_pending_teams", { p_competition_id: round.competition_id });
    await dispatchPendingTeamNotifications([round.competition_id]);
  } catch {
    // 確認結果後的立即分組嘗試失敗不影響「確認本輪結果」本身已經成功,留給訪客造訪
    // /status、/admin/format 時的 lazy check 兜底
  }

  revalidatePath("/judge");
  revalidatePath("/status");
  revalidatePath("/admin/review");
  return { success: true };
}
