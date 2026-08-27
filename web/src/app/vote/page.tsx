import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirectToLogin } from "@/lib/loginRedirect";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { VoteList, type VoteSubmission } from "./VoteList";
import { MatchVoteList, type MatchVoteItem } from "./MatchVoteList";

interface RoundPickerRow {
  id: string;
  name: string;
  competition_id: string;
  competitions: { name: string } | { name: string }[] | null;
}

interface SubmissionRow {
  id: string;
  title: string | null;
  registration_id: string;
  suno_share_url: string;
  registrations: { user_id: string; display_name: string } | { user_id: string; display_name: string }[] | null;
}

interface MatchRow {
  id: string;
  registration_a_id: string;
  registration_b_id: string;
  pools: { name: string } | { name: string }[] | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default async function VotePage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const { round: roundId } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirectToLogin(roundId ? `/vote?round=${encodeURIComponent(roundId)}` : "/vote");

  const nowIso = new Date().toISOString();

  if (!roundId) {
    const { data: rounds } = await supabase
      .from("rounds")
      .select("id, name, competition_id, competitions!inner(name, is_public)")
      .eq("competitions.is_public", true)
      .lte("voting_opens_at", nowIso)
      .gt("voting_closes_at", nowIso)
      .order("voting_closes_at");

    const openRounds = (rounds ?? []) as unknown as RoundPickerRow[];

    return (
      <div>
        <SiteHeader authed active="vote" />
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <div className="mb-7">
            <h1 className="font-display text-[30px]">選擇要投票的場次</h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
              以下是目前開放投票中的輪次。
            </p>
          </div>
          {openRounds.length === 0 ? (
            <EmptyState icon="inbox" title="目前沒有開放投票的輪次" sub="等主辦方開放投票期後再回來看看" />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {openRounds.map((r) => (
                <Link key={r.id} href={`/vote?round=${r.id}`} className="glass block p-4.5 hover:border-accent/30">
                  <div className="mb-1 text-[15px]">{r.name}</div>
                  <div className="text-[12px] text-ink-faint">{one(r.competitions)?.name ?? "未命名比賽"}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const { data: round } = await supabase
    .from("rounds")
    .select("id, name, voting_opens_at, voting_closes_at, competitions(id, name, is_public)")
    .eq("id", roundId)
    .maybeSingle();

  if (!round) redirect("/vote");
  const competition = one(round.competitions);
  if (!competition?.is_public) redirect("/vote");

  const { data: revealedData } = await supabase.rpc("round_identity_revealed", { p_round_id: roundId });
  const revealed = revealedData === true;

  const votingOpen =
    !!round.voting_opens_at &&
    !!round.voting_closes_at &&
    round.voting_opens_at <= nowIso &&
    nowIso < round.voting_closes_at;

  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, title, registration_id, suno_share_url, registrations(user_id, display_name)")
    .eq("round_id", roundId)
    .eq("status", "approved");

  const { data: myVote } = await supabase
    .from("votes")
    .select("submission_id")
    .eq("round_id", roundId)
    .eq("voter_id", userId)
    .maybeSingle();

  const items: VoteSubmission[] = ((submissions ?? []) as unknown as SubmissionRow[]).map((s) => {
    const reg = one(s.registrations);
    return {
      id: s.id,
      title: revealed ? (s.title ?? "未命名作品") : "— 標題於匿名階段不顯示 —",
      isOwn: reg?.user_id === userId,
      // 匿名階段不能給 Suno 連結當備援——點開會看到作者的 Suno 帳號,直接洩漏身份。
      sunoShareUrl: revealed ? s.suno_share_url : null,
    };
  });

  const shuffled = revealed ? items : shuffle(items);

  // 循環賽:這輪如果選了「循環賽」積木,投票不是「自由多選一」,是逐場配對投票——
  // 換一套完全不同的畫面(MatchVoteList),不跟一般投票共用 VoteList。
  const { data: roundBlocks } = await supabase
    .from("round_format_blocks")
    .select("format_blocks(key)")
    .eq("round_id", roundId);
  const isRoundRobin = (roundBlocks ?? []).some((b) => {
    const block = Array.isArray(b.format_blocks) ? b.format_blocks[0] : b.format_blocks;
    return block?.key === "round_robin";
  });

  let matchItems: MatchVoteItem[] = [];
  let initialVotedByMatch: Record<string, string> = {};

  if (isRoundRobin) {
    const { data: matchRows } = await supabase
      .from("matches")
      .select("id, registration_a_id, registration_b_id, pools(name)")
      .eq("round_id", roundId);

    const submissionByRegistration = new Map(
      ((submissions ?? []) as unknown as SubmissionRow[]).map((s) => [s.registration_id, s]),
    );
    const registrationUserById = new Map(
      ((submissions ?? []) as unknown as SubmissionRow[]).map((s) => [s.registration_id, one(s.registrations)?.user_id]),
    );

    const buildSide = (registrationId: string) => {
      const sub = submissionByRegistration.get(registrationId);
      return {
        registrationId,
        submissionId: sub?.id ?? null,
        title: sub ? (revealed ? (sub.title ?? "未命名作品") : "— 標題於匿名階段不顯示 —") : "（這位還沒投稿)",
        isOwn: registrationUserById.get(registrationId) === userId,
        sunoShareUrl: sub && revealed ? sub.suno_share_url : null,
      };
    };

    matchItems = ((matchRows ?? []) as unknown as MatchRow[]).map((m) => ({
      matchId: m.id,
      poolName: one(m.pools)?.name ?? "",
      a: buildSide(m.registration_a_id),
      b: buildSide(m.registration_b_id),
    }));

    const matchIds = matchItems.map((m) => m.matchId);
    const { data: myMatchVotes } = matchIds.length
      ? await supabase.from("match_votes").select("match_id, chosen_registration_id").eq("voter_id", userId).in("match_id", matchIds)
      : { data: [] };
    initialVotedByMatch = Object.fromEntries((myMatchVotes ?? []).map((v) => [v.match_id, v.chosen_registration_id]));
  }

  return (
    <div>
      <SiteHeader authed active="vote" />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7">
          <h1 className="font-display text-[30px]">
            {round.name} — {competition.name}
          </h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            {revealed ? "本輪投票公開進行,看得到作者是誰。" : "本輪投票匿名進行,看不到作者是誰,投票截止後依比賽設定決定何時公開。"}
          </p>
        </div>

        {!votingOpen ? (
          <EmptyState icon="inbox" title="這一輪目前沒有開放投票" sub="投票期還沒開始,或已經截止" />
        ) : isRoundRobin ? (
          matchItems.length === 0 ? (
            <EmptyState icon="inbox" title="還沒有對戰場次" sub="等分組完成後,場次會自動出現在這裡" />
          ) : (
            <MatchVoteList matches={matchItems} initialVotedByMatch={initialVotedByMatch} />
          )
        ) : items.length === 0 ? (
          <EmptyState icon="inbox" title="目前沒有可投票的作品" sub="本輪投稿審核尚未完成,通過審核的作品會自動出現在這裡" />
        ) : (
          <VoteList roundId={roundId} submissions={shuffled} initialVotedId={myVote?.submission_id ?? null} />
        )}
      </div>
    </div>
  );
}
