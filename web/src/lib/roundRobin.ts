import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface RoundRobinStandingRow {
  registrationId: string;
  wins: number;
}

export interface RoundRobinTeamStandingRow {
  teamId: string;
  wins: number;
}

export interface RoundRobinStandings {
  registrationStandings: RoundRobinStandingRow[];
  teamStandings: RoundRobinTeamStandingRow[];
}

// 確認本輪結果時才結算每場配對的贏家(平票算平局,雙方各得 0.5 勝)——不是投票期間
// 即時算,避免在還沒定案前就能看出風向。match_votes 本身沒有開放任何 SELECT policy
// (跟 votes 表個別投票紀錄同一套保護),這裡用 service client 讀,只有 finalize
// 這個受信任的 server action 流程會呼叫到。
//
// team 賽事(matches.team_a_id/team_b_id 不是 null)計票看 chosen_team_id,寫回
// winner_team_id,勝場數記在 teamStandings——呼叫端(judge/actions.ts)不能直接
// 沿用「排序 active registrations、砍固定人數」的既有邏輯套用在 team 賽事上,
// 那樣可能把同一隊砍到只剩一半人,違反「整隊一起淘汰」的設計,必須先判斷
// teamStandings 是否非空、改成以 team 為排序/砍除單位。一輪 round_robin 要嘛
// 整個是 team 賽事要嘛整個是個人賽事,registrationStandings/teamStandings
// 不會同時非空。
export async function computeAndPersistMatchWinners(roundId: string): Promise<RoundRobinStandings> {
  const service = createServiceClient();

  const { data: matches } = await service
    .from("matches")
    .select("id, registration_a_id, registration_b_id, team_a_id, team_b_id")
    .eq("round_id", roundId);
  if (!matches || matches.length === 0) return { registrationStandings: [], teamStandings: [] };

  const matchIds = matches.map((m) => m.id);
  const { data: voteRows } = await service.from("match_votes").select("match_id, chosen_registration_id, chosen_team_id").in("match_id", matchIds);

  const countsByMatch = new Map<string, Map<string, number>>();
  for (const v of voteRows ?? []) {
    const chosenId = v.chosen_team_id ?? v.chosen_registration_id!;
    const counts = countsByMatch.get(v.match_id) ?? new Map<string, number>();
    counts.set(chosenId, (counts.get(chosenId) ?? 0) + 1);
    countsByMatch.set(v.match_id, counts);
  }

  const winsByRegistration = new Map<string, number>();
  const winsByTeam = new Map<string, number>();
  const individualWinnerUpdates: { id: string; winner_registration_id: string | null }[] = [];
  const teamWinnerUpdates: { id: string; winner_team_id: string | null }[] = [];

  for (const m of matches) {
    const isTeamMatch = !!m.team_a_id && !!m.team_b_id;
    const sideAId = isTeamMatch ? m.team_a_id! : m.registration_a_id!;
    const sideBId = isTeamMatch ? m.team_b_id! : m.registration_b_id!;
    const wins = isTeamMatch ? winsByTeam : winsByRegistration;
    const counts = countsByMatch.get(m.id);
    const votesA = counts?.get(sideAId) ?? 0;
    const votesB = counts?.get(sideBId) ?? 0;

    wins.set(sideAId, wins.get(sideAId) ?? 0);
    wins.set(sideBId, wins.get(sideBId) ?? 0);

    if (votesA === votesB) {
      if (isTeamMatch) teamWinnerUpdates.push({ id: m.id, winner_team_id: null });
      else individualWinnerUpdates.push({ id: m.id, winner_registration_id: null });
      wins.set(sideAId, (wins.get(sideAId) ?? 0) + 0.5);
      wins.set(sideBId, (wins.get(sideBId) ?? 0) + 0.5);
    } else {
      const winnerId = votesA > votesB ? sideAId : sideBId;
      if (isTeamMatch) teamWinnerUpdates.push({ id: m.id, winner_team_id: winnerId });
      else individualWinnerUpdates.push({ id: m.id, winner_registration_id: winnerId });
      wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
    }
  }

  await Promise.all([
    ...individualWinnerUpdates.map((u) => service.from("matches").update({ winner_registration_id: u.winner_registration_id }).eq("id", u.id)),
    ...teamWinnerUpdates.map((u) => service.from("matches").update({ winner_team_id: u.winner_team_id }).eq("id", u.id)),
  ]);

  return {
    registrationStandings: Array.from(winsByRegistration.entries()).map(([registrationId, wins]) => ({ registrationId, wins })),
    teamStandings: Array.from(winsByTeam.entries()).map(([teamId, wins]) => ({ teamId, wins })),
  };
}

export async function isRoundRobinRound(roundId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service
    .from("round_format_blocks")
    .select("format_blocks(key)")
    .eq("round_id", roundId);
  return (data ?? []).some((b) => {
    const block = Array.isArray(b.format_blocks) ? b.format_blocks[0] : b.format_blocks;
    return block?.key === "round_robin";
  });
}
