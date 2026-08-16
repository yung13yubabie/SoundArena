import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { RegisterForm } from "./RegisterForm";
import Link from "next/link";

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

  if (!userId) {
    redirect("/login");
  }

  const { competition: competitionId } = await searchParams;

  if (!competitionId) {
    const { data: openCompetitions } = await supabase
      .from("competitions")
      .select("id, name")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    return (
      <div>
        <SiteHeader authed active="events" />
        <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
          <div className="mb-7">
            <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 報名</div>
            <h1 className="font-display text-[30px]">選一場比賽報名</h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
              從活動頁點「查看並報名」會直接帶到這裡；也可以在下面直接選。
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

  const { data: competition } = await supabase
    .from("competitions")
    .select("id, name, registration_closes_at")
    .eq("id", competitionId)
    .maybeSingle();

  if (!competition) {
    return (
      <div>
        <SiteHeader authed active="events" />
        <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
          <EmptyState icon="alert" title="找不到這場比賽" sub="連結可能有誤，回活動頁重新找一次" />
        </div>
      </div>
    );
  }

  const { data: existing } = await supabase
    .from("registrations")
    .select("id, display_name, suno_handle")
    .eq("competition_id", competition.id)
    .eq("user_id", userId)
    .maybeSingle();

  const registrationClosed =
    !!competition.registration_closes_at && new Date(competition.registration_closes_at) < new Date();

  return (
    <RegisterForm
      competitionId={competition.id}
      competitionName={competition.name}
      existing={existing}
      registrationClosed={registrationClosed}
    />
  );
}
