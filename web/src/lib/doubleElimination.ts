import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface TiedMatch {
  matchId: string;
  registrationADisplayName: string;
  registrationBDisplayName: string;
}

export type DoubleEliminationOutcome =
  | { ok: true; loserRegistrationIds: string[] }
  | { ok: false; tiedMatches: TiedMatch[] };

// 跟單敗淘汰同樣不能把平手算平局——但雙敗淘汰多一個分岔:勝部(0敗)場次的輸家
// 不會被淘汰(只是敗場數變1,下一輪進敗部),只有敗部(1敗)場次跟最終戰(final)
// 的輸家才是真的出局。這個判斷要看 matches.bracket 是哪一組,不能像單敗淘汰那樣
// 「每場輸家都淘汰」。
//
// team 賽事(matches.team_a_id/team_b_id 不是 null)計票看 chosen_team_id,寫回
// winner_team_id;敗部/最終戰的輸家展開成該隊「目前還是 active」的全部成員
// registration_id(整隊一起淘汰),呼叫端完全不用知道 team 概念。
export async function computeDoubleEliminationOutcome(roundId: string): Promise<DoubleEliminationOutcome> {
  const service = createServiceClient();

  const { data: matches } = await service
    .from("matches")
    .select(
      "id, bracket, registration_a_id, registration_b_id, team_a_id, team_b_id, registrations_a:registrations!matches_registration_a_id_fkey(display_name), registrations_b:registrations!matches_registration_b_id_fkey(display_name), teams_a:teams!matches_team_a_id_fkey(name), teams_b:teams!matches_team_b_id_fkey(name)",
    )
    .eq("round_id", roundId);
  if (!matches || matches.length === 0) return { ok: true, loserRegistrationIds: [] };

  const matchIds = matches.map((m) => m.id);
  const { data: voteRows } = await service.from("match_votes").select("match_id, chosen_registration_id, chosen_team_id").in("match_id", matchIds);

  const countsByMatch = new Map<string, Map<string, number>>();
  for (const v of voteRows ?? []) {
    const chosenId = v.chosen_team_id ?? v.chosen_registration_id!;
    const counts = countsByMatch.get(v.match_id) ?? new Map<string, number>();
    counts.set(chosenId, (counts.get(chosenId) ?? 0) + 1);
    countsByMatch.set(v.match_id, counts);
  }

  const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

  const tiedMatches: TiedMatch[] = [];
  const decidedIndividual: { matchId: string; winnerId: string; loserId: string; bracket: string | null }[] = [];
  const decidedTeam: { matchId: string; winnerTeamId: string; loserTeamId: string; bracket: string | null }[] = [];

  for (const m of matches) {
    const isTeamMatch = !!m.team_a_id && !!m.team_b_id;
    const sideAId = isTeamMatch ? m.team_a_id! : m.registration_a_id!;
    const sideBId = isTeamMatch ? m.team_b_id! : m.registration_b_id!;
    const counts = countsByMatch.get(m.id);
    const votesA = counts?.get(sideAId) ?? 0;
    const votesB = counts?.get(sideBId) ?? 0;

    if (votesA === votesB) {
      tiedMatches.push({
        matchId: m.id,
        registrationADisplayName: isTeamMatch ? (one(m.teams_a)?.name ?? "（未命名隊伍）") : (one(m.registrations_a)?.display_name ?? "（未命名參賽者）"),
        registrationBDisplayName: isTeamMatch ? (one(m.teams_b)?.name ?? "（未命名隊伍）") : (one(m.registrations_b)?.display_name ?? "（未命名參賽者）"),
      });
    } else if (isTeamMatch) {
      decidedTeam.push({ matchId: m.id, winnerTeamId: votesA > votesB ? sideAId : sideBId, loserTeamId: votesA > votesB ? sideBId : sideAId, bracket: m.bracket });
    } else {
      decidedIndividual.push({ matchId: m.id, winnerId: votesA > votesB ? sideAId : sideBId, loserId: votesA > votesB ? sideBId : sideAId, bracket: m.bracket });
    }
  }

  if (tiedMatches.length > 0) return { ok: false, tiedMatches };

  await Promise.all([
    ...decidedIndividual.map((d) => service.from("matches").update({ winner_registration_id: d.winnerId }).eq("id", d.matchId)),
    ...decidedTeam.map((d) => service.from("matches").update({ winner_team_id: d.winnerTeamId }).eq("id", d.matchId)),
  ]);

  // 只有敗部(losers)跟最終戰(final)的輸家才真的出局;勝部(winners)輸的人
  // 保留 active,下一輪查詢敗場數時會自然歸進敗部組。
  const loserIndividualIds = decidedIndividual.filter((d) => d.bracket === "losers" || d.bracket === "final").map((d) => d.loserId);
  const loserTeamIds = decidedTeam.filter((d) => d.bracket === "losers" || d.bracket === "final").map((d) => d.loserTeamId);

  const { data: loserTeamMembers } = loserTeamIds.length
    ? await service.from("team_members").select("registration_id, registrations(status)").in("team_id", loserTeamIds)
    : { data: [] };
  const loserTeamMemberIds = (loserTeamMembers ?? [])
    .filter((tm) => one(tm.registrations)?.status === "active")
    .map((tm) => tm.registration_id);

  return { ok: true, loserRegistrationIds: [...loserIndividualIds, ...loserTeamMemberIds] };
}

export async function isDoubleEliminationRound(roundId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service.from("round_format_blocks").select("format_blocks(key)").eq("round_id", roundId);
  return (data ?? []).some((b) => {
    const block = Array.isArray(b.format_blocks) ? b.format_blocks[0] : b.format_blocks;
    return block?.key === "double_elimination";
  });
}
