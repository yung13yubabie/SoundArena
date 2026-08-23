import type { SupabaseClient } from "@supabase/supabase-js";
import { type RankableScoreItem } from "@/lib/ranking";

export interface JudgeScoreItemData extends RankableScoreItem {
  label: string;
  templateKey: string | null;
}

export interface JudgeSubmissionData {
  submissionId: string;
  registrationId: string;
  registrationStatus: "active" | "eliminated";
  processDoc: string | null;
  ethicalSourcingDeclared: boolean;
  values: Record<string, number>;
}

export interface JudgeScoringData {
  scoreItems: JudgeScoreItemData[];
  submissions: JudgeSubmissionData[];
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// 從 /judge 頁面抽出來的評分資料組裝邏輯——原本只有 page.tsx 自己在用,現在
// finalizeRoundResults()(自動淘汰計算)也需要同一份「有 registration_id、
// 未經公開揭露閘門過濾」的評分資料。不能重用 get_round_scores()/get_round_submissions()
// 那兩個 RPC,那兩個是給公開結果頁用的,只有「比賽公開 + 投票已截止」才回傳資料——
// 確認本輪結果就是投票剛截止那一刻在跑,而且不是每場比賽都設定公開,套用那兩個 RPC
// 會在私人比賽悄悄算出「沒人被淘汰」這種錯誤結果。這裡改用 judge_submissions_for_round()
// (權限閘是 can_manage_competition(..., 'judge'),不看比賽是否公開)+ 直接查
// submission_scores/votes(RLS 閘是 'review' 權限)。
export async function getJudgeScoringData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  competitionId: string,
  roundId: string,
): Promise<JudgeScoringData> {
  const [{ data: scoringRuleRows }, { data: submissionRows }, { data: votes }] = await Promise.all([
    supabase
      .from("scoring_rules")
      .select("id, round_id, score_items(id, label, kind, weight_percent, score_item_templates(key))")
      .eq("competition_id", competitionId),
    supabase.rpc("judge_submissions_for_round", { p_round_id: roundId }),
    supabase.from("votes").select("submission_id, ai_usage_rating").eq("round_id", roundId),
  ]);

  const scoringRules = (scoringRuleRows ?? []) as unknown as {
    id: string;
    round_id: string | null;
    score_items: { id: string; label: string; kind: "weighted" | "bonus"; weight_percent: number | null; score_item_templates: { key: string } | { key: string }[] | null }[];
  }[];
  const scoringRule = scoringRules.find((sr) => sr.round_id === roundId) ?? scoringRules.find((sr) => sr.round_id === null);
  const scoreItems: JudgeScoreItemData[] = (scoringRule?.score_items ?? []).map((si) => ({
    id: si.id,
    label: si.label,
    kind: si.kind,
    weightPercent: si.weight_percent,
    templateKey: one(si.score_item_templates)?.key ?? null,
  }));

  const voteCounts = new Map<string, number>();
  const ratingSums = new Map<string, { sum: number; count: number }>();
  for (const v of votes ?? []) {
    voteCounts.set(v.submission_id, (voteCounts.get(v.submission_id) ?? 0) + 1);
    if (v.ai_usage_rating !== null) {
      const acc = ratingSums.get(v.submission_id) ?? { sum: 0, count: 0 };
      acc.sum += v.ai_usage_rating;
      acc.count += 1;
      ratingSums.set(v.submission_id, acc);
    }
  }
  const avgRating = (submissionId: string) => {
    const acc = ratingSums.get(submissionId);
    return acc && acc.count > 0 ? acc.sum / acc.count : 0;
  };

  const submissionsRaw = (submissionRows ?? []) as {
    submission_id: string;
    registration_id: string;
    registration_status: "active" | "eliminated";
    process_doc: string | null;
    ethical_sourcing_declared: boolean;
  }[];
  const submissionIds = submissionsRaw.map((s) => s.submission_id);
  const { data: scoreRows } = submissionIds.length
    ? await supabase.from("submission_scores").select("submission_id, score_item_id, raw_value").in("submission_id", submissionIds)
    : { data: [] };
  const scoreByKey = new Map((scoreRows ?? []).map((s) => [`${s.submission_id}:${s.score_item_id}`, s.raw_value]));

  const submissions: JudgeSubmissionData[] = submissionsRaw.map((s) => {
    const values: Record<string, number> = {};
    for (const item of scoreItems) {
      if (item.templateKey === "vote") {
        values[item.id] = voteCounts.get(s.submission_id) ?? 0;
      } else if (item.templateKey === "audience_ai_usage_rating") {
        values[item.id] = avgRating(s.submission_id);
      } else {
        values[item.id] = scoreByKey.get(`${s.submission_id}:${item.id}`) ?? 0;
      }
    }
    return {
      submissionId: s.submission_id,
      registrationId: s.registration_id,
      registrationStatus: s.registration_status,
      processDoc: s.process_doc,
      ethicalSourcingDeclared: s.ethical_sourcing_declared,
      values,
    };
  });

  return { scoreItems, submissions };
}
