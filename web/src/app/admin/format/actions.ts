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
  const defaultAnonymous = formData.get("default_anonymous") !== "off";
  if (!name) return { error: "請填寫比賽名稱" };

  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .insert({
      organizer_id: user.id,
      name,
      slug: slugify(name),
      is_public: true,
    })
    .select("id")
    .single();
  if (competitionError || !competition) return { error: competitionError?.message ?? "建立比賽失敗" };

  const { error: roundsError } = await supabase.rpc("create_initial_rounds", {
    p_competition_id: competition.id,
    p_default_anonymous: defaultAnonymous,
  });
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

export async function updateCompetitionMeta(competitionId: string, name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_competition_name", { p_competition_id: competitionId, p_name: name });
  if (error) return { error: error.message };
  revalidatePath("/admin/format");
  return { success: true };
}

export async function setRoundAnonymity(roundId: string, isAnonymous: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_round_anonymity", { p_round_id: roundId, p_is_anonymous: isAnonymous });
  if (error) return { error: error.message };
  revalidatePath("/admin/format");
  return { success: true };
}

export async function setAllRoundsAnonymity(competitionId: string, isAnonymous: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_all_rounds_anonymity", {
    p_competition_id: competitionId,
    p_is_anonymous: isAnonymous,
  });
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

export async function saveFormatBlockConfig(
  roundId: string,
  blockKey: string,
  config: Record<string, unknown>,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: block, error: blockError } = await supabase
    .from("format_blocks")
    .select("id")
    .eq("key", blockKey)
    .single();
  if (blockError || !block) return { error: blockError?.message ?? "找不到這個賽制積木" };

  const { error } = await supabase
    .from("round_format_blocks")
    .update({ config })
    .eq("round_id", roundId)
    .eq("format_block_id", block.id);
  if (error) return { error: error.message };

  revalidatePath("/admin/format");
  return { success: true };
}

export async function addRound(competitionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_round", { p_competition_id: competitionId });
  if (error) return { error: error.message };
  revalidatePath("/admin/format");
  return { success: true };
}

export async function removeRound(roundId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_round", { p_round_id: roundId });
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

export async function addScoreItem(
  scoringRuleId: string,
  templateKey: string,
): Promise<{ success: true; id: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_score_item_from_template", {
    p_scoring_rule_id: scoringRuleId,
    p_template_key: templateKey,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/format");
  return { success: true, id: data as string };
}
