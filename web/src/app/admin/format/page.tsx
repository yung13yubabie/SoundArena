import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateCompetitionForm } from "./CreateCompetitionForm";
import {
  AdminFormatClient,
  type CompetitionData,
  type RoundData,
  type ScoreItemData,
  type FormatBlockCatalog,
} from "./AdminFormatClient";

interface ScoreItemRow {
  id: string;
  label: string;
  kind: "weighted" | "bonus";
  weight_percent: number | null;
  sort_order: number;
}

interface ScoringRuleRow {
  id: string;
  round_id: string | null;
  score_items: ScoreItemRow[];
}

interface FormatBlockRow {
  round_id: string;
  format_blocks: { key: string; category: "elimination" | "grouping" | "special" } | null;
}

function toScoreItems(rows: ScoreItemRow[]): ScoreItemData[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({ id: r.id, label: r.label, kind: r.kind, weightPercent: r.weight_percent }));
}

export default async function AdminFormatPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub as string;

  const { data: competition } = await supabase
    .from("competitions")
    .select("id, name, anonymity_mode")
    .eq("organizer_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!competition) {
    return <CreateCompetitionForm />;
  }

  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, round_index, name")
    .eq("competition_id", competition.id)
    .order("round_index");

  const roundIds = (rounds ?? []).map((r) => r.id);

  const [{ data: blockRows }, { data: scoringRuleRows }, { data: catalogRows }] = await Promise.all([
    roundIds.length
      ? supabase.from("round_format_blocks").select("round_id, format_blocks(key, category)").in("round_id", roundIds)
      : Promise.resolve({ data: [] as FormatBlockRow[] }),
    supabase
      .from("scoring_rules")
      .select("id, round_id, score_items(id, label, kind, weight_percent, sort_order)")
      .eq("competition_id", competition.id),
    supabase.from("format_blocks").select("key, label, category").order("category").order("key"),
  ]);

  const formatBlockCatalog: FormatBlockCatalog = { elimination: [], grouping: [], special: [] };
  for (const row of catalogRows ?? []) {
    formatBlockCatalog[row.category as "elimination" | "grouping" | "special"].push({ key: row.key, label: row.label });
  }

  const blocks = (blockRows ?? []) as unknown as FormatBlockRow[];
  const scoringRules = (scoringRuleRows ?? []) as unknown as ScoringRuleRow[];
  const defaultRule = scoringRules.find((r) => r.round_id === null);

  const indices = (rounds ?? []).map((r) => r.round_index);
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);

  const roundData: RoundData[] = (rounds ?? []).map((r) => {
    const roundBlocks = blocks.filter((b) => b.round_id === r.id && b.format_blocks);
    const elimination = roundBlocks.find((b) => b.format_blocks!.category === "elimination")?.format_blocks!.key ?? null;
    const grouping = roundBlocks.find((b) => b.format_blocks!.category === "grouping")?.format_blocks!.key ?? null;
    const special = roundBlocks.filter((b) => b.format_blocks!.category === "special").map((b) => b.format_blocks!.key);
    const overrideRule = scoringRules.find((sr) => sr.round_id === r.id) ?? null;

    return {
      id: r.id,
      name: r.name,
      locked: r.round_index === minIdx ? "preliminary" : r.round_index === maxIdx ? "final" : null,
      elimination,
      grouping,
      special,
      scoringRule: overrideRule ? { id: overrideRule.id, items: toScoreItems(overrideRule.score_items ?? []) } : null,
    };
  });

  const competitionData: CompetitionData = {
    id: competition.id,
    name: competition.name,
    anonymityMode: competition.anonymity_mode,
  };

  const defaultItems: ScoreItemData[] = defaultRule ? toScoreItems(defaultRule.score_items ?? []) : [];

  return (
    <AdminFormatClient
      competition={competitionData}
      defaultScoringRuleId={defaultRule?.id ?? null}
      defaultScoreItems={defaultItems}
      rounds={roundData}
      formatBlockCatalog={formatBlockCatalog}
    />
  );
}
