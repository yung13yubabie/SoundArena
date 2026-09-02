import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManageableCompetitions } from "@/lib/manageableCompetitions";
import { redirectToLogin } from "@/lib/loginRedirect";
import { CreateCompetitionForm } from "./CreateCompetitionForm";
import { dispatchPendingTeamNotifications } from "@/lib/notifications";
import {
  AdminFormatClient,
  type CompetitionData,
  type RoundData,
  type ScoreItemData,
  type ScoreItemTemplate,
  type FormatBlockCatalog,
  type WildcardRevivalEventData,
} from "./AdminFormatClient";

interface ScoreItemRow {
  id: string;
  label: string;
  kind: "weighted" | "bonus";
  weight_percent: number | null;
  sort_order: number;
  score_item_templates: { key: string } | { key: string }[] | null;
}

interface ScoringRuleRow {
  id: string;
  round_id: string | null;
  score_items: ScoreItemRow[];
}

interface FormatBlockRow {
  round_id: string;
  config: Record<string, unknown>;
  format_blocks: { key: string; category: "elimination" | "grouping" | "special" } | null;
}

interface TeamMemberRow {
  registration_id: string;
  registrations: { display_name: string } | { display_name: string }[] | null;
}

interface TeamRow {
  id: string;
  round_id: string;
  name: string;
  team_members: TeamMemberRow[];
}

interface PoolRow {
  id: string;
  round_id: string;
  name: string;
  pool_members: TeamMemberRow[];
}

interface MatchRow {
  id: string;
  round_id: string;
  pool_id: string | null;
  registration_a_id: string;
  registration_b_id: string;
  winner_registration_id: string | null;
  bracket: "winners" | "losers" | "final" | null;
  registrations_a: { display_name: string } | { display_name: string }[] | null;
  registrations_b: { display_name: string } | { display_name: string }[] | null;
}

function oneTemplate(value: ScoreItemRow["score_item_templates"]) {
  return Array.isArray(value) ? value[0] : value;
}

function oneDisplayName(value: TeamMemberRow["registrations"]): string {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.display_name ?? "（未命名參賽者）";
}

function toScoreItems(rows: ScoreItemRow[]): ScoreItemData[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      id: r.id,
      label: r.label,
      kind: r.kind,
      weightPercent: r.weight_percent,
      templateKey: oneTemplate(r.score_item_templates)?.key ?? null,
    }));
}

export default async function AdminFormatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: requestedId } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirectToLogin(requestedId ? `/admin/format?c=${encodeURIComponent(requestedId)}` : "/admin/format");
  const userId = claims.claims.sub as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("host_setup_completed, is_platform_admin, host_revoked_at, host_approved_at")
    .eq("id", userId)
    .maybeSingle();
  const isPlatformAdmin = profile?.is_platform_admin ?? false;

  const myCompetitions = await getManageableCompetitions(supabase, "format");

  // DB-03 資安複查:見 judge/page.tsx 同一處註解——host 審核跟 collaborator
  // 權限是兩個獨立維度。只有真的一場都管不到(含沒有任何 collaborator 邀請)
  // 才導去 /admin/profile——這種情況下面才會落入 CreateCompetitionForm,
  // 「建立新比賽」本來就該卡 host 審核,這條規則沒變。
  if (!isPlatformAdmin && myCompetitions.length === 0 && (!profile?.host_setup_completed || !profile?.host_approved_at || profile?.host_revoked_at)) {
    redirect("/admin/profile");
  }

  const competition = requestedId
    ? myCompetitions.find((c) => c.id === requestedId)
    : myCompetitions[0];

  if (!competition) {
    return <CreateCompetitionForm isPlatformAdmin={isPlatformAdmin} />;
  }

  const competitionList = myCompetitions.map((c) => ({ id: c.id, name: c.name }));

  // 團隊分組沒有天然的使用者動作可以掛「立即嘗試」,改成主辦人造訪賽制頁時順便檢查——
  // 見 status/page.tsx 同一處的說明,完全冪等,失敗也不影響這頁的顯示。
  try {
    await supabase.rpc("check_and_form_pending_teams", { p_competition_id: competition.id });
    await supabase.rpc("check_and_form_pending_pools", { p_competition_id: competition.id });
    await supabase.rpc("check_and_form_pending_matches", { p_competition_id: competition.id });
    await supabase.rpc("check_and_form_pending_single_elimination_matches", { p_competition_id: competition.id });
    await supabase.rpc("check_and_form_pending_double_elimination_matches", { p_competition_id: competition.id });
    await dispatchPendingTeamNotifications([competition.id]);
  } catch {
    // 分組/配對檢查/送出通知失敗不影響賽制頁本身的顯示
  }

  const { data: rounds } = await supabase
    .from("rounds")
    .select(
      "id, round_index, name, is_anonymous, submission_opens_at, submission_closes_at, voting_opens_at, voting_closes_at, elimination_percent",
    )
    .eq("competition_id", competition.id)
    .order("round_index");

  const roundIds = (rounds ?? []).map((r) => r.id);

  const [
    { data: blockRows },
    { data: scoringRuleRows },
    { data: catalogRows },
    { data: scoreTemplateRows },
    { count: registrationCount },
    { data: teamRows },
  ] = await Promise.all([
    roundIds.length
      ? supabase.from("round_format_blocks").select("round_id, config, format_blocks(key, category)").in("round_id", roundIds)
      : Promise.resolve({ data: [] as FormatBlockRow[] }),
    supabase
      .from("scoring_rules")
      .select("id, round_id, score_items(id, label, kind, weight_percent, sort_order, score_item_templates(key))")
      .eq("competition_id", competition.id),
    supabase.from("format_blocks").select("key, label, category").order("category").order("key"),
    supabase.from("score_item_templates").select("key, label, default_kind").order("label"),
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("competition_id", competition.id),
    roundIds.length
      ? supabase
          .from("teams")
          .select("id, round_id, name, team_members(registration_id, registrations(display_name))")
          .in("round_id", roundIds)
          .order("name")
      : Promise.resolve({ data: [] as TeamRow[] }),
  ]);

  const [{ data: poolRows }, { data: matchRows }] = await Promise.all([
    roundIds.length
      ? supabase
          .from("pools")
          .select("id, round_id, name, pool_members(registration_id, registrations(display_name))")
          .in("round_id", roundIds)
          .order("name")
      : Promise.resolve({ data: [] as PoolRow[] }),
    roundIds.length
      ? supabase
          .from("matches")
          .select(
            "id, round_id, pool_id, registration_a_id, registration_b_id, winner_registration_id, bracket, registrations_a:registrations!matches_registration_a_id_fkey(display_name), registrations_b:registrations!matches_registration_b_id_fkey(display_name)",
          )
          .in("round_id", roundIds)
      : Promise.resolve({ data: [] as MatchRow[] }),
  ]);

  const formatBlockCatalog: FormatBlockCatalog = { elimination: [], grouping: [], special: [] };
  for (const row of catalogRows ?? []) {
    formatBlockCatalog[row.category as "elimination" | "grouping" | "special"].push({ key: row.key, label: row.label });
  }

  const scoreItemTemplates: ScoreItemTemplate[] = (scoreTemplateRows ?? []).map((t) => ({
    key: t.key,
    label: t.label,
    defaultKind: t.default_kind as "weighted" | "bonus",
  }));

  const blocks = (blockRows ?? []) as unknown as FormatBlockRow[];
  const scoringRules = (scoringRuleRows ?? []) as unknown as ScoringRuleRow[];
  const defaultRule = scoringRules.find((r) => r.round_id === null);
  const teams = (teamRows ?? []) as unknown as TeamRow[];
  const pools = (poolRows ?? []) as unknown as PoolRow[];
  const matches = (matchRows ?? []) as unknown as MatchRow[];
  const poolNameById = new Map(pools.map((p) => [p.id, p.name]));

  const indices = (rounds ?? []).map((r) => r.round_index);
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);

  const roundData: RoundData[] = (rounds ?? []).map((r) => {
    const roundBlocks = blocks.filter((b) => b.round_id === r.id && b.format_blocks);
    const elimination = roundBlocks.find((b) => b.format_blocks!.category === "elimination")?.format_blocks!.key ?? null;
    const grouping = roundBlocks.find((b) => b.format_blocks!.category === "grouping")?.format_blocks!.key ?? null;
    const specialBlocks = roundBlocks.filter((b) => b.format_blocks!.category === "special");
    const special = specialBlocks.map((b) => b.format_blocks!.key);
    const themedRoundConfig = specialBlocks.find((b) => b.format_blocks!.key === "themed_round")?.config as
      | { theme_type?: "keyword" | "genre"; theme_value?: string }
      | undefined;
    const teamConfig = roundBlocks.find((b) => b.format_blocks!.key === "team")?.config as { group_count?: number } | undefined;
    const lotteryConfig = roundBlocks.find((b) => b.format_blocks!.key === "lottery")?.config as { pool_size?: number } | undefined;
    const overrideRule = scoringRules.find((sr) => sr.round_id === r.id) ?? null;

    return {
      id: r.id,
      name: r.name,
      locked: r.round_index === minIdx ? "preliminary" : r.round_index === maxIdx ? "final" : null,
      elimination,
      grouping,
      special,
      isAnonymous: r.is_anonymous,
      themeConfig: themedRoundConfig?.theme_value
        ? { themeType: themedRoundConfig.theme_type ?? "keyword", themeValue: themedRoundConfig.theme_value }
        : null,
      groupCount: teamConfig?.group_count ?? null,
      eliminationPercent: r.elimination_percent,
      teams: teams
        .filter((t) => t.round_id === r.id)
        .map((t) => ({
          id: t.id,
          name: t.name,
          members: t.team_members.map((m) => ({
            registrationId: m.registration_id,
            displayName: oneDisplayName(m.registrations),
          })),
        })),
      poolSize: lotteryConfig?.pool_size ?? null,
      pools: pools
        .filter((p) => p.round_id === r.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          members: p.pool_members.map((m) => ({
            registrationId: m.registration_id,
            displayName: oneDisplayName(m.registrations),
          })),
        })),
      matches: matches
        .filter((m) => m.round_id === r.id)
        .map((m) => ({
          id: m.id,
          poolName: (m.pool_id ? poolNameById.get(m.pool_id) : undefined) ?? "",
          registrationAId: m.registration_a_id,
          registrationADisplayName: oneDisplayName(m.registrations_a),
          registrationBId: m.registration_b_id,
          registrationBDisplayName: oneDisplayName(m.registrations_b),
          winnerRegistrationId: m.winner_registration_id,
          bracket: m.bracket,
        })),
      scoringRule: overrideRule ? { id: overrideRule.id, items: toScoreItems(overrideRule.score_items ?? []) } : null,
      submissionOpensAt: r.submission_opens_at,
      submissionClosesAt: r.submission_closes_at,
      votingOpensAt: r.voting_opens_at,
      votingClosesAt: r.voting_closes_at,
    };
  });

  const competitionData: CompetitionData = {
    id: competition.id,
    name: competition.name,
  };

  function oneRel<T>(value: T | T[] | null): T | null {
    return Array.isArray(value) ? (value[0] ?? null) : value;
  }

  const { data: wcEventRow } = await supabase
    .from("wildcard_revival_events")
    .select("id, voting_opens_at, voting_closes_at, resolved_at, rounds(name), registrations(display_name)")
    .eq("competition_id", competition.id)
    .maybeSingle();
  const { data: wcCandidateRows } = wcEventRow
    ? await supabase.from("wildcard_revival_candidates").select("registration_id, registrations(display_name)").eq("event_id", wcEventRow.id)
    : { data: [] as { registration_id: string; registrations: { display_name: string } | { display_name: string }[] | null }[] };

  const wildcardRevival: WildcardRevivalEventData | null = wcEventRow
    ? {
        id: wcEventRow.id,
        sourceRoundName: oneRel(wcEventRow.rounds)?.name ?? "",
        votingOpensAt: wcEventRow.voting_opens_at,
        votingClosesAt: wcEventRow.voting_closes_at,
        resolvedAt: wcEventRow.resolved_at,
        winnerDisplayName: wcEventRow.resolved_at ? (oneRel(wcEventRow.registrations)?.display_name ?? null) : null,
        candidates: (wcCandidateRows ?? []).map((c) => ({
          registrationId: c.registration_id,
          displayName: oneRel(c.registrations)?.display_name ?? "（未命名參賽者）",
        })),
      }
    : null;

  const defaultItems: ScoreItemData[] = defaultRule ? toScoreItems(defaultRule.score_items ?? []) : [];

  return (
    <AdminFormatClient
      competition={competitionData}
      defaultScoringRuleId={defaultRule?.id ?? null}
      defaultScoreItems={defaultItems}
      rounds={roundData}
      formatBlockCatalog={formatBlockCatalog}
      scoreItemTemplates={scoreItemTemplates}
      competitionList={competitionList}
      isPlatformAdmin={isPlatformAdmin}
      hasRegistrations={(registrationCount ?? 0) > 0}
      wildcardRevival={wildcardRevival}
    />
  );
}
