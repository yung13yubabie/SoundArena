import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { RegisterForm } from "./RegisterForm";
import Link from "next/link";
import { redirectToLogin } from "@/lib/loginRedirect";

// SPEC.md 第2節「存取順序(硬性)」：未登入不得進入報名頁。src/proxy.ts already
// redirects at the routing layer; this is the defense-in-depth check Next.js's
// own docs recommend doing inside the route itself too.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;

  const { competition: competitionId } = await searchParams;

  if (!userId) {
    redirectToLogin(competitionId ? `/register?competition=${encodeURIComponent(competitionId)}` : "/register");
  }

  if (!competitionId) {
    const { data: openCompetitions } = await supabase
      .from("competitions")
      .select("id, name")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    return (
      <div>
        <SiteHeader authed active="events" />
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <div className="mb-7">
            <h1 className="font-display text-[30px]">選一場比賽報名</h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
              從探索比賽頁點「查看並報名」會直接帶到這裡；也可以在下面直接選。
            </p>
          </div>
          {!openCompetitions || openCompetitions.length === 0 ? (
            <EmptyState icon="inbox" title="目前沒有可以報名的比賽" sub="等主辦方建立比賽後再回來看看" />
          ) : (
            <div className="flex max-w-[560px] flex-col gap-2">
              {openCompetitions.map((c) => (
                <Link
                  key={c.id}
                  href={`/register?competition=${c.id}`}
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

  const [{ data: competition }, { data: existing }, { data: rounds }] = await Promise.all([
    supabase.from("competitions").select("id, name, registration_closes_at").eq("id", competitionId).maybeSingle(),
    supabase
      .from("registrations")
      .select("id, display_name, suno_handle, review_status, review_note")
      .eq("competition_id", competitionId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("rounds")
      .select("round_index, name, submission_opens_at, submission_closes_at, voting_opens_at, voting_closes_at")
      .eq("competition_id", competitionId)
      .order("round_index"),
  ]);

  if (!competition) {
    return (
      <div>
        <SiteHeader authed active="events" />
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <EmptyState icon="alert" title="找不到這場比賽" sub="連結可能有誤，回探索比賽頁重新找一次" />
        </div>
      </div>
    );
  }

  const registrationClosed =
    !!competition.registration_closes_at && new Date(competition.registration_closes_at) < new Date();

  const roundSchedule = (rounds ?? []).map((r) => ({
    name: r.name,
    submissionOpensAt: r.submission_opens_at,
    submissionClosesAt: r.submission_closes_at,
    votingOpensAt: r.voting_opens_at,
    votingClosesAt: r.voting_closes_at,
  }));

  return (
    <RegisterForm
      competitionId={competition.id}
      competitionName={competition.name}
      existing={existing}
      registrationClosed={registrationClosed}
      rounds={roundSchedule}
    />
  );
}
