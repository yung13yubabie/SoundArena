import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface TiedMatch {
  matchId: string;
  registrationADisplayName: string;
  registrationBDisplayName: string;
}

export type SingleEliminationOutcome =
  | { ok: true; loserRegistrationIds: string[] }
  | { ok: false; tiedMatches: TiedMatch[] };

// 單敗淘汰不能像循環賽一樣把平手算平局——平手代表這場比賽選不出誰晉級,不能讓
// 兩邊都過。grilling 確認:平手時整個拒絕確認本輪結果,列出哪些場次平手,主辦人
// 到「本輪專屬時程」延長投票時間讓更多人投票後再重新確認——不在這裡猜贏家。
// 沒平手的場次才會結算贏家、寫回 matches.winner_registration_id。
export async function computeSingleEliminationOutcome(roundId: string): Promise<SingleEliminationOutcome> {
  const service = createServiceClient();

  const { data: matches } = await service
    .from("matches")
    .select(
      "id, registration_a_id, registration_b_id, registrations_a:registrations!matches_registration_a_id_fkey(display_name), registrations_b:registrations!matches_registration_b_id_fkey(display_name)",
    )
    .eq("round_id", roundId);
  if (!matches || matches.length === 0) return { ok: true, loserRegistrationIds: [] };

  const matchIds = matches.map((m) => m.id);
  const { data: voteRows } = await service.from("match_votes").select("match_id, chosen_registration_id").in("match_id", matchIds);

  const countsByMatch = new Map<string, Map<string, number>>();
  for (const v of voteRows ?? []) {
    const counts = countsByMatch.get(v.match_id) ?? new Map<string, number>();
    counts.set(v.chosen_registration_id, (counts.get(v.chosen_registration_id) ?? 0) + 1);
    countsByMatch.set(v.match_id, counts);
  }

  const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

  const tiedMatches: TiedMatch[] = [];
  const decided: { matchId: string; winnerId: string; loserId: string }[] = [];

  for (const m of matches) {
    const counts = countsByMatch.get(m.id);
    const votesA = counts?.get(m.registration_a_id) ?? 0;
    const votesB = counts?.get(m.registration_b_id) ?? 0;

    if (votesA === votesB) {
      tiedMatches.push({
        matchId: m.id,
        registrationADisplayName: one(m.registrations_a)?.display_name ?? "（未命名參賽者）",
        registrationBDisplayName: one(m.registrations_b)?.display_name ?? "（未命名參賽者）",
      });
    } else {
      const winnerId = votesA > votesB ? m.registration_a_id : m.registration_b_id;
      const loserId = votesA > votesB ? m.registration_b_id : m.registration_a_id;
      decided.push({ matchId: m.id, winnerId, loserId });
    }
  }

  if (tiedMatches.length > 0) return { ok: false, tiedMatches };

  await Promise.all(decided.map((d) => service.from("matches").update({ winner_registration_id: d.winnerId }).eq("id", d.matchId)));

  return { ok: true, loserRegistrationIds: decided.map((d) => d.loserId) };
}

export async function isSingleEliminationRound(roundId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data } = await service.from("round_format_blocks").select("format_blocks(key)").eq("round_id", roundId);
  return (data ?? []).some((b) => {
    const block = Array.isArray(b.format_blocks) ? b.format_blocks[0] : b.format_blocks;
    return block?.key === "single_elimination";
  });
}
