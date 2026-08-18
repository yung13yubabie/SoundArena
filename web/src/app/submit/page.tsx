import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { SubmitForm, type RoundOption } from "./SubmitForm";

interface RegistrationRow {
  id: string;
  suno_handle: string;
  competition_id: string;
  competitions: { name: string } | { name: string }[] | null;
}

function competitionName(c: RegistrationRow["competitions"]): string {
  const row = Array.isArray(c) ? c[0] : c;
  return row?.name ?? "未命名比賽";
}

export default async function SubmitPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { data: registrations } = await supabase
    .from("registrations")
    .select("id, suno_handle, competition_id, competitions(name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("review_status", "approved");

  const regs = (registrations ?? []) as unknown as RegistrationRow[];
  const competitionIds = regs.map((r) => r.competition_id);

  const [{ data: rounds }, { data: existingSubmissions }] = await Promise.all([
    competitionIds.length
      ? supabase
          .from("rounds")
          .select("id, name, competition_id")
          .in("competition_id", competitionIds)
          .eq("allows_new_submissions", true)
      : Promise.resolve({ data: [] as { id: string; name: string; competition_id: string }[] }),
    regs.length
      ? supabase
          .from("submissions")
          .select("round_id, registration_id")
          .in(
            "registration_id",
            regs.map((r) => r.id),
          )
      : Promise.resolve({ data: [] as { round_id: string; registration_id: string }[] }),
  ]);

  const roundIds = (rounds ?? []).map((r) => r.id);
  const { data: themedBlocks } = roundIds.length
    ? await supabase
        .from("round_format_blocks")
        .select("round_id, config, format_blocks!inner(key)")
        .in("round_id", roundIds)
        .eq("format_blocks.key", "themed_round")
    : { data: [] as { round_id: string; config: { theme_type?: "keyword" | "genre"; theme_value?: string } }[] };

  const themeByRound = new Map(
    (themedBlocks ?? [])
      .filter((b) => !!b.config?.theme_value)
      .map((b) => [b.round_id, b.config as { theme_type?: "keyword" | "genre"; theme_value?: string }]),
  );

  const submitted = new Set((existingSubmissions ?? []).map((s) => `${s.round_id}:${s.registration_id}`));

  const options: RoundOption[] = [];
  for (const reg of regs) {
    for (const round of rounds ?? []) {
      if (round.competition_id !== reg.competition_id) continue;
      if (submitted.has(`${round.id}:${reg.id}`)) continue;
      const theme = themeByRound.get(round.id);
      options.push({
        roundId: round.id,
        registrationId: reg.id,
        sunoHandle: reg.suno_handle,
        label: `${competitionName(reg.competitions)} · ${round.name}`,
        theme: theme
          ? { type: theme.theme_type === "genre" ? "曲風" : "關鍵字/詞句", value: theme.theme_value! }
          : null,
      });
    }
  }

  if (options.length === 0) {
    return (
      <div>
        <SiteHeader authed active="submit" />
        <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
          <div className="mb-7">
            <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 投稿</div>
            <h1 className="font-display text-[30px]">投稿本輪作品</h1>
          </div>
          <EmptyState
            icon="inbox"
            title="目前沒有可以投稿的輪次"
            sub={regs.length === 0 ? "先報名一場比賽才能投稿" : "你已經投稿完目前開放的輪次，或還沒有比賽開放投稿中"}
          />
        </div>
      </div>
    );
  }

  return <SubmitForm options={options} />;
}
