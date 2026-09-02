import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { SubmitForm, type RoundOption, type TeamCandidate, type TeamMember } from "./SubmitForm";
import { redirectToLogin } from "@/lib/loginRedirect";

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

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function SubmitPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirectToLogin("/submit");

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
  const [{ data: themedBlocks }, { data: teamBlocks }] = await Promise.all([
    roundIds.length
      ? supabase
          .from("round_format_blocks")
          .select("round_id, config, format_blocks!inner(key)")
          .in("round_id", roundIds)
          .eq("format_blocks.key", "themed_round")
      : Promise.resolve({ data: [] as { round_id: string; config: { theme_type?: "keyword" | "genre"; theme_value?: string } }[] }),
    roundIds.length
      ? supabase.from("round_format_blocks").select("round_id, format_blocks!inner(key)").in("round_id", roundIds).eq("format_blocks.key", "team")
      : Promise.resolve({ data: [] as { round_id: string }[] }),
  ]);

  const themeByRound = new Map(
    (themedBlocks ?? [])
      .filter((b) => !!b.config?.theme_value)
      .map((b) => [b.round_id, b.config as { theme_type?: "keyword" | "genre"; theme_value?: string }]),
  );
  const teamRoundIds = new Set((teamBlocks ?? []).map((b) => b.round_id));

  const submitted = new Set((existingSubmissions ?? []).map((s) => `${s.round_id}:${s.registration_id}`));

  // team 模式下每個 round×registration 組合都要知道:所屬隊伍、隊長是誰、隊員
  // 名單、隊內目前有哪些候選投稿——用 stage 起始輪(get_team_stage_start_round_id)
  // 查 team_members,因為對戰配對賽制/月週期累積制的隊伍是跨輪次固定的,team_members
  // 掛在 stage 起始輪,不是「這一輪」自己。
  const teamDataByRoundReg = new Map<
    string,
    { teamId: string; teamName: string; isCaptain: boolean; captainDisplayName: string; members: TeamMember[]; candidates: TeamCandidate[] }
  >();

  for (const round of rounds ?? []) {
    if (!teamRoundIds.has(round.id)) continue;
    const regsInThisRound = regs.filter((r) => r.competition_id === round.competition_id);
    if (regsInThisRound.length === 0) continue;

    const { data: stageStartRoundId } = await supabase.rpc("get_team_stage_start_round_id", { p_round_id: round.id });
    if (!stageStartRoundId) continue;

    const { data: memberRows } = await supabase
      .from("team_members")
      .select("team_id, registration_id, registrations(display_name)")
      .eq("round_id", stageStartRoundId)
      .in(
        "registration_id",
        regsInThisRound.map((r) => r.id),
      );

    for (const mr of memberRows ?? []) {
      const key = `${round.id}:${mr.registration_id}`;
      if (teamDataByRoundReg.has(key)) continue;

      const [{ data: team }, { data: allMembers }, { data: candidates }] = await Promise.all([
        supabase.from("teams").select("name, captain_registration_id, registrations!teams_captain_registration_id_fkey(display_name)").eq("id", mr.team_id).maybeSingle(),
        supabase.from("team_members").select("registration_id, registrations(display_name)").eq("team_id", mr.team_id),
        supabase
          .from("submissions")
          .select("id, title, suno_share_url, is_team_selected, registrations(display_name)")
          .eq("team_id", mr.team_id)
          .eq("round_id", round.id),
      ]);

      teamDataByRoundReg.set(key, {
        teamId: mr.team_id,
        teamName: team?.name ?? "未命名隊伍",
        isCaptain: team?.captain_registration_id === mr.registration_id,
        captainDisplayName: one(team?.registrations)?.display_name ?? "（未指定）",
        members: (allMembers ?? []).map((m) => ({ registrationId: m.registration_id, displayName: one(m.registrations)?.display_name ?? "（未命名參賽者）" })),
        candidates: (candidates ?? []).map((c) => ({
          submissionId: c.id,
          title: c.title,
          uploaderDisplayName: one(c.registrations)?.display_name ?? "（未命名參賽者）",
          isSelected: c.is_team_selected,
          sunoShareUrl: c.suno_share_url,
        })),
      });
    }
  }

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
        team: teamDataByRoundReg.get(`${round.id}:${reg.id}`) ?? null,
      });
    }
  }

  if (options.length === 0) {
    return (
      <div>
        <SiteHeader authed active="submit" />
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <div className="mb-7">
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
