import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface RoundRobinStandingRow {
  registrationId: string;
  wins: number;
}

// 確認本輪結果時才結算每場配對的贏家(平票算平局,雙方各得 0.5 勝)——不是投票期間
// 即時算,避免在還沒定案前就能看出風向。match_votes 本身沒有開放任何 SELECT policy
// (跟 votes 表個別投票紀錄同一套保護),這裡用 service client 讀,只有 finalize
// 這個受信任的 server action 流程會呼叫到。
export async function computeAndPersistMatchWinners(roundId: string): Promise<RoundRobinStandingRow[]> {
  const service = createServiceClient();

  const { data: matches } = await service
    .from("matches")
    .select("id, registration_a_id, registration_b_id")
    .eq("round_id", roundId);
  if (!matches || matches.length === 0) return [];

  const matchIds = matches.map((m) => m.id);
  const { data: voteRows } = await service.from("match_votes").select("match_id, chosen_registration_id").in("match_id", matchIds);

  const countsByMatch = new Map<string, Map<string, number>>();
  for (const v of voteRows ?? []) {
    const counts = countsByMatch.get(v.match_id) ?? new Map<string, number>();
    counts.set(v.chosen_registration_id, (counts.get(v.chosen_registration_id) ?? 0) + 1);
    countsByMatch.set(v.match_id, counts);
  }

  const winsByRegistration = new Map<string, number>();
  const winnerUpdates: { id: string; winner_registration_id: string | null }[] = [];

  for (const m of matches) {
    const counts = countsByMatch.get(m.id);
    const votesA = counts?.get(m.registration_a_id) ?? 0;
    const votesB = counts?.get(m.registration_b_id) ?? 0;

    winsByRegistration.set(m.registration_a_id, winsByRegistration.get(m.registration_a_id) ?? 0);
    winsByRegistration.set(m.registration_b_id, winsByRegistration.get(m.registration_b_id) ?? 0);

    if (votesA === votesB) {
      winnerUpdates.push({ id: m.id, winner_registration_id: null });
      winsByRegistration.set(m.registration_a_id, (winsByRegistration.get(m.registration_a_id) ?? 0) + 0.5);
      winsByRegistration.set(m.registration_b_id, (winsByRegistration.get(m.registration_b_id) ?? 0) + 0.5);
    } else {
      const winnerId = votesA > votesB ? m.registration_a_id : m.registration_b_id;
      winnerUpdates.push({ id: m.id, winner_registration_id: winnerId });
      winsByRegistration.set(winnerId, (winsByRegistration.get(winnerId) ?? 0) + 1);
    }
  }

  await Promise.all(winnerUpdates.map((u) => service.from("matches").update({ winner_registration_id: u.winner_registration_id }).eq("id", u.id)));

  return Array.from(winsByRegistration.entries()).map(([registrationId, wins]) => ({ registrationId, wins }));
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
