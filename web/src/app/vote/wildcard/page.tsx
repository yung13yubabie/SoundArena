import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { redirectToLogin } from "@/lib/loginRedirect";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { WildcardVoteList, type WildcardCandidate } from "./WildcardVoteList";

interface EventRow {
  id: string;
  source_round_id: string;
  voting_opens_at: string;
  voting_closes_at: string;
  resolved_at: string | null;
  competitions: { name: string; is_public: boolean } | { name: string; is_public: boolean }[] | null;
}

interface CandidateRow {
  registration_id: string;
  user_id: string;
  submission_id: string | null;
  title: string | null;
  suno_share_url: string | null;
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

export default async function WildcardVotePage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event: eventId } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirectToLogin(eventId ? `/vote/wildcard?event=${encodeURIComponent(eventId)}` : "/vote/wildcard");
  if (!eventId) redirect("/vote");

  const { data: eventRow } = await supabase
    .from("wildcard_revival_events")
    .select("id, source_round_id, voting_opens_at, voting_closes_at, resolved_at, competitions(name, is_public)")
    .eq("id", eventId)
    .maybeSingle();
  const event = eventRow as unknown as EventRow | null;
  const competition = event ? one(event.competitions) : null;
  if (!event || !competition?.is_public) redirect("/vote");

  const nowIso = new Date().toISOString();
  const votingOpen = event.voting_opens_at <= nowIso && nowIso < event.voting_closes_at;

  const { data: revealedData } = await supabase.rpc("round_identity_revealed", { p_round_id: event.source_round_id });
  const revealed = revealedData === true;

  // 用 get_wildcard_revival_candidates() RPC 讀,不直接查 wildcard_revival_candidates
  // 內嵌的 registrations/submissions——一般投票者的 session 受 RLS 限制,兩張表都
  // 讀不到別人的資料。這支 RPC 只在事件自己的投票視窗開放中才回傳資料。
  const { data: candidateRows } = await supabase.rpc("get_wildcard_revival_candidates", { p_event_id: event.id });
  const candidates = (candidateRows ?? []) as unknown as CandidateRow[];

  const { data: myVote } = await supabase
    .from("wildcard_revival_votes")
    .select("chosen_registration_id")
    .eq("event_id", event.id)
    .eq("voter_id", userId)
    .maybeSingle();

  const items: WildcardCandidate[] = candidates.map((c) => ({
    registrationId: c.registration_id,
    submissionId: c.submission_id,
    title: c.submission_id ? (revealed ? (c.title ?? "未命名作品") : "— 標題於匿名階段不顯示 —") : "（這位沒有這一輪的投稿）",
    isOwn: c.user_id === userId,
    sunoShareUrl: c.submission_id && revealed ? c.suno_share_url : null,
  }));
  const shuffled = revealed ? items : shuffle(items);

  return (
    <div>
      <SiteHeader authed active="vote" />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7">
          <h1 className="font-display text-[30px]">外卡復活投票 — {competition.name}</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            投給你認為最應該重新加入比賽的候選人，得票最高者復活。{revealed ? "本次投票公開進行，看得到作者是誰。" : "本次投票匿名進行，看不到作者是誰。"}
          </p>
        </div>
        {event.resolved_at ? (
          <EmptyState icon="check" title="這次外卡復活已經確認結果" sub="投票已結束，感謝參與" />
        ) : !votingOpen ? (
          <EmptyState icon="inbox" title="外卡復活投票目前沒有開放" sub="投票期還沒開始，或已經截止" />
        ) : (
          <WildcardVoteList eventId={event.id} candidates={shuffled} initialVotedId={myVote?.chosen_registration_id ?? null} />
        )}
      </div>
    </div>
  );
}
