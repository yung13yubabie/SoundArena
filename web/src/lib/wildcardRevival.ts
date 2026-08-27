import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { computeRanking } from "@/lib/ranking";
import { getJudgeScoringData, getPeriodicAccumulationStageRoundIds, mergeJudgeScoringData } from "@/lib/judgeScoring";
import { isRoundRobinRound } from "@/lib/roundRobin";
import { isSingleEliminationRound } from "@/lib/singleElimination";

// 外卡復活候選名單——「離晉級線最近」的排序演算法依 source_round 用的賽制分岔:
// 循環賽用勝場數(含平局0.5勝)由高到低、單敗淘汰用場次票數差距由小到大(輸得越
// 驚險排越前面)、月週期累積制/一般%淘汰用累積分數由高到低。回傳依此排序後取前
// topN 的 registration id——只回傳「這一輪真的被淘汰的人」,不做其他篩選。
//
// supabase 參數要傳呼叫端(主辦人)自己的 session client,不能是 service client——
// 月週期累積制/一般%淘汰分支重用 getJudgeScoringData(),裡面呼叫的
// judge_submissions_for_round() RPC 權限閘是 can_manage_competition(...,'judge'),
// 靠 auth.uid() 判斷,service_role 呼叫會直接被擋成空結果。循環賽/單敗淘汰分支需要
// 讀 match_votes(RLS 只開放「自己查自己投過誰」),這裡另外開一個 service client
// 讀,只有這個受信任的 server action 流程會呼叫到。
export async function computeWildcardRevivalCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  competitionId: string,
  sourceRoundId: string,
  topN: number,
): Promise<string[]> {
  const { data: eliminatedRows } = await supabase
    .from("registrations")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("eliminated_in_round_id", sourceRoundId);
  const eliminatedIds = new Set((eliminatedRows ?? []).map((r) => r.id as string));
  if (eliminatedIds.size === 0) return [];

  const service = createServiceClient();

  if (await isSingleEliminationRound(sourceRoundId)) {
    const { data: matches } = await service.from("matches").select("id, registration_a_id, registration_b_id, winner_registration_id").eq("round_id", sourceRoundId);
    const matchIds = (matches ?? []).map((m) => m.id);
    const { data: voteRows } = matchIds.length
      ? await service.from("match_votes").select("match_id, chosen_registration_id").in("match_id", matchIds)
      : { data: [] };
    const countsByMatch = new Map<string, Map<string, number>>();
    for (const v of voteRows ?? []) {
      const counts = countsByMatch.get(v.match_id) ?? new Map<string, number>();
      counts.set(v.chosen_registration_id, (counts.get(v.chosen_registration_id) ?? 0) + 1);
      countsByMatch.set(v.match_id, counts);
    }
    const marginByRegistration = new Map<string, number>();
    for (const m of matches ?? []) {
      const loserId = m.winner_registration_id === m.registration_a_id ? m.registration_b_id : m.registration_a_id;
      if (!eliminatedIds.has(loserId)) continue;
      const counts = countsByMatch.get(m.id);
      const votesA = counts?.get(m.registration_a_id) ?? 0;
      const votesB = counts?.get(m.registration_b_id) ?? 0;
      marginByRegistration.set(loserId, Math.abs(votesA - votesB));
    }
    return Array.from(eliminatedIds)
      .sort((a, b) => (marginByRegistration.get(a) ?? Infinity) - (marginByRegistration.get(b) ?? Infinity))
      .slice(0, topN);
  }

  if (await isRoundRobinRound(sourceRoundId)) {
    const { data: matches } = await service.from("matches").select("registration_a_id, registration_b_id, winner_registration_id").eq("round_id", sourceRoundId);
    const winsByRegistration = new Map<string, number>();
    for (const m of matches ?? []) {
      if (m.winner_registration_id === null) {
        winsByRegistration.set(m.registration_a_id, (winsByRegistration.get(m.registration_a_id) ?? 0) + 0.5);
        winsByRegistration.set(m.registration_b_id, (winsByRegistration.get(m.registration_b_id) ?? 0) + 0.5);
      } else {
        winsByRegistration.set(m.winner_registration_id, (winsByRegistration.get(m.winner_registration_id) ?? 0) + 1);
      }
    }
    return Array.from(eliminatedIds)
      .sort((a, b) => (winsByRegistration.get(b) ?? 0) - (winsByRegistration.get(a) ?? 0))
      .slice(0, topN);
  }

  const stageRoundIds = await getPeriodicAccumulationStageRoundIds(supabase, competitionId, sourceRoundId);
  const roundIdsToScore = stageRoundIds ?? [sourceRoundId];
  const perRoundData = await Promise.all(roundIdsToScore.map((rid) => getJudgeScoringData(supabase, competitionId, rid)));
  const { scoreItems, values } = mergeJudgeScoringData(perRoundData);
  const ranking = computeRanking(
    scoreItems,
    Array.from(values.entries()).map(([id, v]) => ({ id, values: v })),
  );
  const totalByRegistration = new Map(ranking.map((r) => [r.id, r.total]));
  return Array.from(eliminatedIds)
    .sort((a, b) => (totalByRegistration.get(b) ?? 0) - (totalByRegistration.get(a) ?? 0))
    .slice(0, topN);
}

export interface WildcardRevivalTiedCandidate {
  registrationId: string;
  displayName: string;
  votes: number;
}

export type WildcardRevivalOutcome =
  | { ok: true; winnerRegistrationId: string }
  | { ok: false; tiedCandidates: WildcardRevivalTiedCandidate[] };

// 確認外卡復活結果——票數最高的候選人贏,平手(最高票不只一人)整個擋下,
// 邏輯比照 single_elimination/double_elimination「確認本輪結果」的平手處理。
export async function computeWildcardRevivalOutcome(eventId: string): Promise<WildcardRevivalOutcome> {
  const service = createServiceClient();

  const { data: candidates } = await service
    .from("wildcard_revival_candidates")
    .select("registration_id, registrations(display_name)")
    .eq("event_id", eventId);
  if (!candidates || candidates.length === 0) return { ok: false, tiedCandidates: [] };

  const { data: voteRows } = await service.from("wildcard_revival_votes").select("chosen_registration_id").eq("event_id", eventId);
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c.registration_id, 0);
  for (const v of voteRows ?? []) counts.set(v.chosen_registration_id, (counts.get(v.chosen_registration_id) ?? 0) + 1);

  const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
  const maxVotes = Math.max(...Array.from(counts.values()));
  const topCandidates = candidates.filter((c) => counts.get(c.registration_id) === maxVotes);

  if (topCandidates.length > 1) {
    return {
      ok: false,
      tiedCandidates: topCandidates.map((c) => ({
        registrationId: c.registration_id,
        displayName: one(c.registrations)?.display_name ?? "（未命名參賽者）",
        votes: maxVotes,
      })),
    };
  }

  return { ok: true, winnerRegistrationId: topCandidates[0].registration_id };
}
