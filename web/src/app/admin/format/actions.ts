"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "competition"}-${suffix}`;
}

const DEFAULT_SCORE_ITEMS = [
  { templateKey: "vote", label: "投票", weightPercent: 40, sortOrder: 0 },
  { templateKey: "video_traffic", label: "影片流量", weightPercent: 25, sortOrder: 1 },
  { templateKey: "external_vote", label: "外部投票", weightPercent: 35, sortOrder: 2 },
];

async function insertDefaultScoreItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scoringRuleId: string,
) {
  const { data: templates } = await supabase
    .from("score_item_templates")
    .select("id, key")
    .in(
      "key",
      DEFAULT_SCORE_ITEMS.map((i) => i.templateKey),
    );
  const templateIdByKey = Object.fromEntries((templates ?? []).map((t) => [t.key, t.id]));

  await supabase.from("score_items").insert(
    DEFAULT_SCORE_ITEMS.map((i) => ({
      scoring_rule_id: scoringRuleId,
      template_id: templateIdByKey[i.templateKey] ?? null,
      label: i.label,
      kind: "weighted" as const,
      weight_percent: i.weightPercent,
      sort_order: i.sortOrder,
    })),
  );
}

export async function createCompetition(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const name = String(formData.get("name") ?? "").trim();
  const anonymityMode = String(formData.get("anonymity_mode") ?? "per_round_anonymous");
  if (!name) return { error: "請填寫比賽名稱" };

  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .insert({
      organizer_id: user.id,
      name,
      slug: slugify(name),
      anonymity_mode: anonymityMode,
      is_public: true,
    })
    .select("id")
    .single();
  if (competitionError || !competition) return { error: competitionError?.message ?? "建立比賽失敗" };

  const { error: roundsError } = await supabase.from("rounds").insert([
    { competition_id: competition.id, round_index: 1, name: "初賽" },
    { competition_id: competition.id, round_index: 2, name: "決賽" },
  ]);
  if (roundsError) return { error: roundsError.message };

  const { data: scoringRule, error: scoringError } = await supabase
    .from("scoring_rules")
    .insert({ competition_id: competition.id, round_id: null })
    .select("id")
    .single();
  if (scoringError || !scoringRule) return { error: scoringError?.message ?? "建立評分規則失敗" };

  await insertDefaultScoreItems(supabase, scoringRule.id);

  revalidatePath("/admin/format");
  revalidatePath("/");
  return { success: true };
}

export async function updateCompetitionMeta(
  competitionId: string,
  name: string,
  anonymityMode: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("competitions")
    .update({ name, anonymity_mode: anonymityMode })
    .eq("id", competitionId);
  if (error) return { error: error.message };
  revalidatePath("/admin/format");
  return { success: true };
}

export async function toggleFormatBlock(
  roundId: string,
  category: "elimination" | "grouping" | "special",
  blockKey: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: block, error: blockError } = await supabase
    .from("format_blocks")
    .select("id")
    .eq("key", blockKey)
    .single();
  if (blockError || !block) return { error: blockError?.message ?? "找不到這個賽制積木" };

  if (category === "special") {
    const { data: existing } = await supabase
      .from("round_format_blocks")
      .select("id")
      .eq("round_id", roundId)
      .eq("format_block_id", block.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("round_format_blocks").delete().eq("id", existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from("round_format_blocks")
        .insert({ round_id: roundId, format_block_id: block.id });
      if (error) return { error: error.message };
    }
  } else {
    const { data: categoryBlocks } = await supabase.from("format_blocks").select("id").eq("category", category);
    const ids = (categoryBlocks ?? []).map((b) => b.id);
    if (ids.length) {
      const { error } = await supabase
        .from("round_format_blocks")
        .delete()
        .eq("round_id", roundId)
        .in("format_block_id", ids);
      if (error) return { error: error.message };
    }
    const { error } = await supabase
      .from("round_format_blocks")
      .insert({ round_id: roundId, format_block_id: block.id });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/format");
  return { success: true };
}

export async function addRound(competitionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, round_index")
    .eq("competition_id", competitionId)
    .order("round_index", { ascending: false });
  if (!rounds || rounds.length === 0) return { error: "找不到比賽" };

  const finalRound = rounds[0];
  const newIndex = finalRound.round_index;

  const { error: shiftError } = await supabase
    .from("rounds")
    .update({ round_index: newIndex + 1 })
    .eq("id", finalRound.id);
  if (shiftError) return { error: shiftError.message };

  const { error: insertError } = await supabase.from("rounds").insert({
    competition_id: competitionId,
    round_index: newIndex,
    name: `第 ${newIndex} 輪 · 新輪次`,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath("/admin/format");
  return { success: true };
}

export async function removeRound(roundId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: round } = await supabase
    .from("rounds")
    .select("id, competition_id, round_index")
    .eq("id", roundId)
    .single();
  if (!round) return { error: "找不到輪次" };

  const { data: siblings } = await supabase
    .from("rounds")
    .select("round_index")
    .eq("competition_id", round.competition_id);
  const indices = (siblings ?? []).map((r) => r.round_index);
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);
  if (round.round_index === minIdx || round.round_index === maxIdx) {
    return { error: "初賽與決賽不可移除" };
  }

  const { error } = await supabase.from("rounds").delete().eq("id", roundId);
  if (error) return { error: error.message };

  revalidatePath("/admin/format");
  return { success: true };
}

export async function toggleScoringOverride(
  roundId: string,
  competitionId: string,
  enable: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();

  if (enable) {
    const { data: rule, error } = await supabase
      .from("scoring_rules")
      .insert({ competition_id: competitionId, round_id: roundId })
      .select("id")
      .single();
    if (error || !rule) return { error: error?.message ?? "建立覆寫規則失敗" };
    await insertDefaultScoreItems(supabase, rule.id);
  } else {
    const { error } = await supabase.from("scoring_rules").delete().eq("round_id", roundId);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/format");
  return { success: true };
}

export async function saveScoreItems(
  scoringRuleId: string,
  items: Array<{ id: string; label: string; kind: "weighted" | "bonus"; weight_percent: number | null }>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_score_items", {
    p_scoring_rule_id: scoringRuleId,
    p_items: items,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/format");
  return { success: true };
}
