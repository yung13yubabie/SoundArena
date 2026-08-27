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
  registrations: { user_id: string; display_name: string } | { user_id: string; display_name: string }[] | null;
}

interface SubmissionRow {
  id: string;
  title: string | null;
  registration_id: string;
  suno_share_url: string;
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

  const { data: candidateRows } = await supabase
    .from("wildcard_revival_candidates")
    .select("registration_id, registrations(user_id, display_name)")
    .eq("event_id", event.id);
  const candidates = (candidateRows ?? []) as unknown as CandidateRow[];
  const candidateRegIds = candidates.map((c) => c.registration_id);

  const { data: submissionRows } = candidateRegIds.length
    ? await supabase.from("submissions").select("id, title, registration_id, suno_share_url").eq("round_id", event.source_round_id).in("registration_id", candidateRegIds)
    : { data: [] as SubmissionRow[] };
  const submissionByRegistration = new Map(((submissionRows ?? []) as SubmissionRow[]).map((s) => [s.registration_id, s]));

  const { data: myVote } = await supabase
    .from("wildcard_revival_votes")
    .select("chosen_registration_id")
    .eq("event_id", event.id)
    .eq("voter_id", userId)
    .maybeSingle();

  const items: WildcardCandidate[] = candidates.map((c) => {
    const reg = one(c.registrations);
    const sub = submissionByRegistration.get(c.registration_id);
    return {
      registrationId: c.registration_id,
      submissionId: sub?.id ?? null,
      title: sub ? (revealed ? (sub.title ?? "未命名作品") : "— 標題於匿名階段不顯示 —") : "（這位沒有這一輪的投稿）",
      isOwn: reg?.user_id === userId,
      sunoShareUrl: sub && revealed ? sub.suno_share_url : null,
    };
  });
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
