import type { SupabaseClient } from "@supabase/supabase-js";
import { getJudgeScoringData, getPeriodicAccumulationStageRoundIds, mergeJudgeScoringData } from "@/lib/judgeScoring";
import { computeRanking } from "@/lib/ranking";

// team 賽事共用的小工具——不用 service client,傳入呼叫端自己的 session client
// 就好(這裡用到的表/RPC 都是 authenticated 可讀的範圍,不像 match_votes 那種
// 需要 service_role 才能繞過 RLS 讀到別人的投票紀錄)。

export async function isTeamGroupingRound(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  roundId: string,
): Promise<boolean> {
  const { data } = await supabase.from("round_format_blocks").select("format_blocks(key)").eq("round_id", roundId);
  return (data ?? []).some((b) => {
    const block = Array.isArray(b.format_blocks) ? b.format_blocks[0] : b.format_blocks;
    return block?.key === "team";
  });
}

export async function getTeamStageStartRoundId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  roundId: string,
): Promise<string | null> {
  const { data } = await supabase.rpc("get_team_stage_start_round_id", { p_round_id: roundId });
  return (data as string | null) ?? null;
}

// periodic_accumulation/一般%淘汰的 team 排名——team 的分數就是「這個賽段各輪
// is_team_selected=true 那筆官方投稿」的分數總和(不是隊員各自投稿的平均,Q1
// 確認一隊只有一筆共用投稿)。judge_submissions_for_round() 已經在 RPC 層過濾掉
// 候選草稿,這裡拿到的 registrationId 就是每一輪代表隊伍送出投稿的那個人,
// 用 submissions.team_id 反查回 team,加總進同一隊的分數。
export async function computeTeamScoreTotals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  competitionId: string,
  roundId: string,
  activeTeamIds: string[],
): Promise<Map<string, number>> {
  const stageRoundIds = await getPeriodicAccumulationStageRoundIds(supabase, competitionId, roundId);
  const roundIdsToScore = stageRoundIds ?? [roundId];

  const perRoundData = await Promise.all(roundIdsToScore.map((rid) => getJudgeScoringData(supabase, competitionId, rid)));
  const { scoreItems, values } = mergeJudgeScoringData(perRoundData);
  const ranking = computeRanking(
    scoreItems,
    Array.from(values.entries()).map(([id, v]) => ({ id, values: v })),
  );
  const totalByRegistration = new Map(ranking.map((r) => [r.id, r.total]));

  const { data: teamSubmissions } = await supabase
    .from("submissions")
    .select("registration_id, team_id")
    .in("round_id", roundIdsToScore)
    .eq("is_team_selected", true)
    .in("team_id", activeTeamIds);

  const totalByTeam = new Map<string, number>();
  for (const s of teamSubmissions ?? []) {
    const current = totalByTeam.get(s.team_id) ?? 0;
    totalByTeam.set(s.team_id, current + (totalByRegistration.get(s.registration_id) ?? 0));
  }
  return totalByTeam;
}
