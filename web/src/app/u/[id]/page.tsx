import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/lib/icons";
import { youtubeEmbedUrl } from "@/lib/youtube";
import { getRoundResults, rankOf } from "@/lib/roundResults";

interface RegistrationRow {
  id: string;
  status: "active" | "eliminated";
  competition_id: string;
  competitions: { name: string; is_public: boolean } | { name: string; is_public: boolean }[] | null;
}

interface ResultRoundRow {
  round_id: string;
  round_name: string;
  round_index: number;
  submission_id: string;
}

interface Placement {
  roundId: string;
  roundName: string;
  rank: number;
  total: number;
}

interface SubmissionRow {
  id: string;
  title: string | null;
  suno_share_url: string;
  registrations: { competitions: { name: string } | { name: string }[] | null } | Array<{
    competitions: { name: string } | { name: string }[] | null;
  }> | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, bio, social_link, featured_track_url, host_setup_completed")
    .eq("id", id)
    .maybeSingle();

  if (!profile) notFound();

  const { data: authClaims } = await supabase.auth.getClaims();
  const viewerId = authClaims?.claims?.sub as string | undefined;
  const authed = !!viewerId;

  const [{ count: hostedCount }, { data: hostedCompetitions }, { data: registrations }, { data: submissions }] =
    await Promise.all([
      supabase.from("competitions").select("id", { count: "exact", head: true }).eq("organizer_id", id).eq("is_public", true),
      supabase.from("competitions").select("id, name").eq("organizer_id", id).eq("is_public", true).order("created_at", { ascending: false }),
      supabase
        .from("registrations")
        .select("id, status, competition_id, competitions(name, is_public)")
        .eq("user_id", id)
        .eq("is_public", true),
      supabase
        .from("submissions")
        .select("id, title, suno_share_url, registrations!inner(user_id, competitions(name))")
        .eq("registrations.user_id", id)
        .eq("allow_public_playback", true)
        .eq("status", "approved"),
    ]);

  const embedUrl = profile.featured_track_url ? youtubeEmbedUrl(profile.featured_track_url) : null;
  const regs = (registrations ?? []) as unknown as RegistrationRow[];
  const subs = (submissions ?? []) as unknown as SubmissionRow[];

  const placementByReg = new Map<string, Placement | null>();
  await Promise.all(
    regs.map(async (reg) => {
      const { data: resultRounds } = await supabase.rpc("get_registration_result_rounds", { p_registration_id: reg.id });
      const rows = (resultRounds ?? []) as ResultRoundRow[];
      if (rows.length === 0) {
        placementByReg.set(reg.id, null);
        return;
      }
      const latest = rows.reduce((a, b) => (b.round_index > a.round_index ? b : a));
      const { submissions: roundSubs, ranking } = await getRoundResults(supabase, latest.round_id, reg.competition_id);
      placementByReg.set(reg.id, {
        roundId: latest.round_id,
        roundName: latest.round_name,
        rank: rankOf(latest.submission_id, ranking),
        total: roundSubs.length,
      });
    }),
  );

  return (
    <div>
      <SiteHeader authed={authed} />
      <div className="mx-auto max-w-[860px] px-11 pt-10 pb-24">
        <div className="glass mb-6 p-7">
          <div className="mb-4 flex items-center gap-4">
            <Avatar name={profile.display_name ?? "?"} avatarUrl={profile.avatar_url} size={64} />
            <div>
              <h1 className="font-display text-[24px]">{profile.display_name ?? "（未設定名稱）"}</h1>
              {profile.host_setup_completed && <div className="mt-1 text-[12.5px] text-ink-faint">主辦過 {hostedCount ?? 0} 場比賽</div>}
            </div>
          </div>
          {profile.bio && <p className="mb-3 text-[13.5px] leading-relaxed text-ink-dim">{profile.bio}</p>}
          {profile.social_link && (
            <a
              href={profile.social_link}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1.5 text-[12.5px] text-accent hover:underline"
            >
              <Icon name="externalLink" size={13} /> {profile.social_link}
            </a>
          )}
        </div>

        {embedUrl && (
          <div className="glass mb-6 p-5">
            <div className="mb-2.5 text-[11px] tracking-wide text-ink-faint uppercase">推薦曲目</div>
            <iframe
              src={embedUrl}
              className="aspect-video w-full rounded-[10px] border border-panel-border"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {hostedCompetitions && hostedCompetitions.length > 0 && (
          <div className="glass mb-6 p-5">
            <div className="mb-2.5 text-[11px] tracking-wide text-ink-faint uppercase">主辦紀錄</div>
            {hostedCompetitions.map((c) => (
              <div key={c.id} className="border-b border-panel-border py-2 text-[13px] last:border-b-0">
                {c.name}
              </div>
            ))}
          </div>
        )}

        <div className="glass mb-6 p-5">
          <div className="mb-2.5 text-[11px] tracking-wide text-ink-faint uppercase">參賽紀錄</div>
          {regs.length === 0 ? (
            <EmptyState icon="inbox" title="這位使用者還沒有公開任何參賽紀錄" sub="" />
          ) : (
            regs.map((r) => {
              const comp = one(r.competitions);
              const placement = placementByReg.get(r.id);
              return (
                <div key={r.id} className="flex items-center justify-between border-b border-panel-border py-2 text-[13px] last:border-b-0">
                  <span>
                    {comp?.name ?? "（比賽未公開）"}
                    {r.status === "eliminated" && <span className="ml-2 text-[11px] text-bad">已淘汰</span>}
                  </span>
                  {placement ? (
                    <Link href={`/results?round=${placement.roundId}`} className="text-[11px] text-accent hover:underline">
                      {placement.roundName} 第 {placement.rank} 名(共 {placement.total} 組) →
                    </Link>
                  ) : (
                    <span className="text-[11px] text-ink-faint">結果尚未公布</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {subs.length > 0 && (
          <div className="glass p-5">
            <div className="mb-2.5 text-[11px] tracking-wide text-ink-faint uppercase">投稿作品</div>
            {subs.map((s) => {
              const reg = one(s.registrations);
              const comp = reg ? one(reg.competitions) : null;
              return (
                <a
                  key={s.id}
                  href={s.suno_share_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between border-b border-panel-border py-2 text-[13px] last:border-b-0 hover:text-accent"
                >
                  <span>
                    {s.title ?? "未命名作品"}
                    {comp?.name && <span className="ml-2 text-[11px] text-ink-faint">{comp.name}</span>}
                  </span>
                  <Icon name="externalLink" size={12} />
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
