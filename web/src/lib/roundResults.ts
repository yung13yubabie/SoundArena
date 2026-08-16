import type { SupabaseClient } from "@supabase/supabase-js";
import { computeRanking, rankOf, type RankableScoreItem } from "@/lib/ranking";

interface RoundSubmissionRpcRow {
  submission_id: string;
  title: string | null;
  display_name: string | null;
}

interface RoundScoreRpcRow {
  submission_id: string;
  score_item_id: string;
  raw_value: number;
}

interface ScoreItemRow {
  id: string;
  label: string;
  kind: "weighted" | "bonus";
  weight_percent: number | null;
  score_item_templates: { key: string } | { key: string }[] | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface RoundResults {
  submissions: RoundSubmissionRpcRow[];
  scoreItems: (RankableScoreItem & { label: string; templateKey: string | null })[];
  ranking: ReturnType<typeof computeRanking>;
  weightSum: number;
  valuesBySubmission: Map<string, Record<string, number>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRoundResults(supabase: SupabaseClient<any>, roundId: string, competitionId: string): Promise<RoundResults> {
  const [{ data: submissionRows }, { data: scoreRows }, { data: ruleRows }] = await Promise.all([
    supabase.rpc("get_round_submissions", { p_round_id: roundId }),
    supabase.rpc("get_round_scores", { p_round_id: roundId }),
    supabase
      .from("scoring_rules")
      .select("id, round_id, score_items(id, label, kind, weight_percent, score_item_templates(key))")
      .eq("competition_id", competitionId),
  ]);

  const scoringRules = (ruleRows ?? []) as unknown as { id: string; round_id: string | null; score_items: ScoreItemRow[] }[];
  const scoringRule = scoringRules.find((sr) => sr.round_id === roundId) ?? scoringRules.find((sr) => sr.round_id === null);
  const scoreItems = (scoringRule?.score_items ?? []).map((si) => ({
    id: si.id,
    label: si.label,
    kind: si.kind,
    weightPercent: si.weight_percent,
    templateKey: one(si.score_item_templates)?.key ?? null,
  }));

  const submissions = (submissionRows ?? []) as RoundSubmissionRpcRow[];
  const scoreRowsTyped = (scoreRows ?? []) as RoundScoreRpcRow[];
  const valuesBySubmission = new Map<string, Record<string, number>>();
  for (const row of scoreRowsTyped) {
    const values = valuesBySubmission.get(row.submission_id) ?? {};
    values[row.score_item_id] = Number(row.raw_value);
    valuesBySubmission.set(row.submission_id, values);
  }

  const rankable = submissions.map((s) => ({ id: s.submission_id, values: valuesBySubmission.get(s.submission_id) ?? {} }));
  const ranking = computeRanking(scoreItems, rankable);
  const weightSum = scoreItems.filter((i) => i.kind === "weighted").reduce((s, i) => s + (i.weightPercent ?? 0), 0);

  return { submissions, scoreItems, ranking, weightSum, valuesBySubmission };
}

export { rankOf };
