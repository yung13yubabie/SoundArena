"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";
import { dispatchPendingTeamNotifications } from "@/lib/notifications";
import { computeRanking } from "@/lib/ranking";
import { getJudgeScoringData, getPeriodicAccumulationStageRoundIds, mergeJudgeScoringData } from "@/lib/judgeScoring";
import { computeAndPersistMatchWinners, isRoundRobinRound } from "@/lib/roundRobin";
import { computeSingleEliminationOutcome, isSingleEliminationRound } from "@/lib/singleElimination";

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

  // 單敗淘汰:不套用 elimination_percent(那是%自動淘汰,單敗淘汰是「輸家100%出局」,
  // 兩套機制不疊加)——獨立分岔,平手時直接拒絕確認,不往下走一般的淘汰配額邏輯。
  const isSingleElim = await isSingleEliminationRound(roundId);
  if (isSingleElim) {
    const outcome = await computeSingleEliminationOutcome(roundId);
    if (!outcome.ok) {
      const tiedList = outcome.tiedMatches.map((m) => `${m.registrationADisplayName} vs ${m.registrationBDisplayName}`).join("、");
      return { error: `以下場次平手,無法分出晉級者:${tiedList}。請到下方「本輪專屬時程」延長投票時間,等更多人投票後再重新確認` };
    }

    const { error: singleElimFinalizeErr } = await supabase.rpc("finalize_round_results", {
      p_round_id: roundId,
      p_eliminate_registration_ids: outcome.loserRegistrationIds,
    });
    if (singleElimFinalizeErr) return { error: toFriendlyError(singleElimFinalizeErr) };

    try {
      await supabase.rpc("check_and_form_pending_single_elimination_matches", { p_competition_id: round.competition_id });
    } catch {
      // 下一輪配對的立即嘗試失敗不影響「確認本輪結果」本身已經成功,留給訪客造訪
      // /status、/admin/format 時的 lazy check 兜底
    }

    revalidatePath("/judge");
    revalidatePath("/status");
    revalidatePath("/admin/review");
    return { success: true };
  }

  // 循環賽:先結算每場配對的贏家(平票算平局,雙方各得 0.5 勝),不管這輪有沒有設定
  // 自動淘汰都要做——沒有勝負紀錄,matches.winner_registration_id 永遠是 null,結果頁
  // 沒東西可以顯示。這一步獨立於下面的淘汰名單計算。
  const isRoundRobin = await isRoundRobinRound(roundId);
  const roundRobinStandings = isRoundRobin ? await computeAndPersistMatchWinners(roundId) : null;

  let eliminateIds: string[] = [];
  if (round.elimination_percent && round.elimination_percent > 0) {
    const { data: activeRegs } = await supabase.from("registrations").select("id").eq("competition_id", round.competition_id).eq("status", "active");
    const activeIds = (activeRegs ?? []).map((r) => r.id);

    let totalByRegistration: Map<string, number>;
    if (roundRobinStandings) {
      // 循環賽:排名基準是「勝場數」(含平局的 0.5),不是加權分數。
      totalByRegistration = new Map(roundRobinStandings.map((s) => [s.registrationId, s.wins]));
    } else {
      // 月/週期累積制:排名不是只看這一輪自己的分數,是看這個週期累積賽段從頭到
      // 現在所有週期的分數總和(見 lib/judgeScoring.ts 的說明)。不是累積制的輪次
      // 維持原本的單輪次排名,行為不變。
      const stageRoundIds = await getPeriodicAccumulationStageRoundIds(supabase, round.competition_id, roundId);
      const roundIdsToScore = stageRoundIds ?? [roundId];
      const perRoundData = await Promise.all(roundIdsToScore.map((rid) => getJudgeScoringData(supabase, round.competition_id, rid)));
      const { scoreItems, values } = mergeJudgeScoringData(perRoundData);
      const ranking = computeRanking(
        scoreItems,
        Array.from(values.entries()).map(([id, v]) => ({ id, values: v })),
      );
      totalByRegistration = new Map(ranking.map((r) => [r.id, r.total]));
    }

    // 這輪沒投稿/沒比賽紀錄的 active 報名者視為 0 分、排在墊底——報名截止時他們本來
    // 就有機會投稿卻沒投,承擔被淘汰的風險是合理的,不用另外設計特殊豁免規則。同分
    // 時用 registration_id 排序當穩定 tiebreak,結果不會每次重算就不一樣。
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
    await supabase.rpc("check_and_form_pending_pools", { p_competition_id: round.competition_id });
    await supabase.rpc("check_and_form_pending_matches", { p_competition_id: round.competition_id });
    await dispatchPendingTeamNotifications([round.competition_id]);
  } catch {
    // 確認結果後的立即分組/配對嘗試失敗不影響「確認本輪結果」本身已經成功,留給訪客
    // 造訪 /status、/admin/format 時的 lazy check 兜底
  }

  revalidatePath("/judge");
  revalidatePath("/status");
  revalidatePath("/admin/review");
  return { success: true };
}
