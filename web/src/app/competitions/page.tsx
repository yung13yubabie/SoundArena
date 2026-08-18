import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { CompetitionBrowser, type BrowserRound } from "./CompetitionBrowser";

interface SubmissionRow {
  id: string;
  title: string | null;
  round_id: string;
}

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string }>;
}) {
  const { competition: competitionId } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const authed = !!claims?.claims;

  if (!competitionId) {
    const { data: competitions } = await supabase
      .from("competitions")
      .select("id, name")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    return (
      <div>
        <SiteHeader authed={authed} active="competitions" />
        <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
          <div className="mb-7">
            <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 比賽</div>
            <h1 className="font-display text-[30px]">選一場比賽瀏覽作品</h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
              從活動頁點「試聽作品」會直接帶到這裡；也可以在下面直接選。
            </p>
          </div>
          {!competitions || competitions.length === 0 ? (
            <EmptyState icon="inbox" title="目前沒有公開的比賽" sub="等主辦方建立比賽後再回來看看" />
          ) : (
            <div className="flex max-w-[560px] flex-col gap-2">
              {competitions.map((c) => (
                <Link
                  key={c.id}
                  href={`/competitions?competition=${c.id}`}
                  className="glass p-4 text-[14px] hover:border-accent/40"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const { data: competition } = await supabase
    .from("competitions")
    .select("id, name, is_public")
    .eq("id", competitionId)
    .maybeSingle();

  if (!competition || !competition.is_public) {
    return (
      <div>
        <SiteHeader authed={authed} active="competitions" />
        <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
          <EmptyState icon="alert" title="找不到這場比賽" sub="連結可能有誤，回活動頁重新找一次" />
        </div>
      </div>
    );
  }

  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, name, round_index")
    .eq("competition_id", competition.id)
    .order("round_index");

  const roundIds = (rounds ?? []).map((r) => r.id);

  const { data: submissions } = roundIds.length
    ? await supabase
        .from("submissions")
        .select("id, title, round_id")
        .in("round_id", roundIds)
        .eq("status", "approved")
        .eq("allow_public_playback", true)
    : { data: [] as SubmissionRow[] };

  const submissionRows = (submissions ?? []) as SubmissionRow[];

  const browserRounds: BrowserRound[] = (rounds ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    tracks: submissionRows
      .filter((s) => s.round_id === r.id)
      .map((s) => ({ id: s.id, title: s.title ?? "未命名作品" })),
  }));

  return (
    <CompetitionBrowser
      competitionId={competition.id}
      competitionName={competition.name}
      rounds={browserRounds}
      authed={authed}
    />
  );
}
