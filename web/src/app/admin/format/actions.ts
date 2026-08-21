"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";
import { deleteAudioObject } from "@/lib/storage";
import { getRoundResults } from "@/lib/roundResults";

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
  if (name.length > 200) return { error: "比賽名稱最長 200 字" };

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
  if (competitionError || !competition) return { error: toFriendlyError(competitionError ?? { message: "建立比賽失敗" }) };

  const { error: roundsError } = await supabase.rpc("create_initial_rounds", {
    p_competition_id: competition.id,
    p_default_anonymous: defaultAnonymous,
  });
  if (roundsError) return { error: toFriendlyError(roundsError) };

  const { data: scoringRule, error: scoringError } = await supabase
    .from("scoring_rules")
    .insert({ competition_id: competition.id, round_id: null })
    .select("id")
    .single();
  if (scoringError || !scoringRule) return { error: toFriendlyError(scoringError ?? { message: "建立評分規則失敗" }) };

  await insertDefaultScoreItems(supabase, scoringRule.id);

  revalidatePath("/admin/format");
  revalidatePath("/");
  return { success: true };
}

export async function updateCompetitionMeta(competitionId: string, name: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (name.trim().length > 200) return { error: "比賽名稱最長 200 字" };
  const { error } = await supabase.rpc("update_competition_name", { p_competition_id: competitionId, p_name: name });
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/admin/format");
  return { success: true };
}

export async function setRoundAnonymity(roundId: string, isAnonymous: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_round_anonymity", { p_round_id: roundId, p_is_anonymous: isAnonymous });
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/admin/format");
  return { success: true };
}

export async function setAllRoundsAnonymity(competitionId: string, isAnonymous: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_all_rounds_anonymity", {
    p_competition_id: competitionId,
    p_is_anonymous: isAnonymous,
  });
  if (error) return { error: toFriendlyError(error) };
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
      if (error) return { error: toFriendlyError(error) };
    } else {
      const { error } = await supabase
        .from("round_format_blocks")
        .insert({ round_id: roundId, format_block_id: block.id });
      if (error) return { error: toFriendlyError(error) };
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
      if (error) return { error: toFriendlyError(error) };
    }
    const { error } = await supabase
      .from("round_format_blocks")
      .insert({ round_id: roundId, format_block_id: block.id });
    if (error) return { error: toFriendlyError(error) };
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
  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/admin/format");
  return { success: true };
}

export async function addRound(competitionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_round", { p_competition_id: competitionId });
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/admin/format");
  return { success: true };
}

export async function removeRound(roundId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_round", { p_round_id: roundId });
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/admin/format");
  return { success: true };
}

export async function deleteCompetition(competitionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_competition", { p_competition_id: competitionId });
  if (error) {
    return {
      error: toFriendlyError(error, [
        {
          test: (m) => m.includes("already has real registrations"),
          friendly: "這場比賽已經有真實報名紀錄，無法自助刪除——請透過「意見回饋」聯繫平台管理員協助刪除",
        },
      ]),
    };
  }
  revalidatePath("/admin/format");
  revalidatePath("/");
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
    if (error) return { error: toFriendlyError(error) };
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
  if (error) return { error: toFriendlyError(error) };
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
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/admin/format");
  return { success: true, id: data as string };
}

export type CleanupAudioResult = { success: true; cleared: number } | { error: string };

// 使用者原本的留存政策:前三名保留音檔,其餘參賽者淘汰後移除音檔,只留 Suno 連結,
// 而且要等整場比賽完全結束才統一清,不逐輪清。「前三名」判斷用決賽的加權計分排名
// (跟公開結果頁 /results 同一套 getRoundResults() 邏輯,不重寫第二份排名算法);
// 保留的是這些人在全部輪次的音檔,不只是決賽那一筆——初賽也上傳過音檔的話一併保留。
export async function cleanupNonFinalistAudio(competitionId: string): Promise<CleanupAudioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, voting_closes_at")
    .eq("competition_id", competitionId)
    .order("round_index", { ascending: false })
    .limit(1);
  const finalRound = rounds?.[0];
  if (!finalRound) return { error: "找不到這場比賽的輪次" };
  if (!finalRound.voting_closes_at || new Date(finalRound.voting_closes_at) > new Date()) {
    return { error: "比賽還沒完全結束（決賽投票尚未截止），還不能清除音檔" };
  }

  const results = await getRoundResults(supabase, finalRound.id, competitionId);
  const top3SubmissionIds = new Set([...results.ranking].sort((a, b) => b.total - a.total).slice(0, 3).map((r) => r.id));

  const { data: finalSubs } = await supabase.from("submissions").select("id, registration_id").eq("round_id", finalRound.id);
  const keepRegistrationIds = new Set(
    (finalSubs ?? []).filter((s) => top3SubmissionIds.has(s.id)).map((s) => s.registration_id),
  );

  const { data: allSubs } = await supabase
    .from("submissions")
    .select("id, registration_id, audio_object_key, rounds!inner(competition_id)")
    .eq("rounds.competition_id", competitionId)
    .not("audio_object_key", "is", null);

  let cleared = 0;
  for (const s of allSubs ?? []) {
    if (keepRegistrationIds.has(s.registration_id)) continue;
    if (s.audio_object_key) {
      try {
        await deleteAudioObject(s.audio_object_key);
      } catch {
        // B2 檔案沒刪成功也要繼續清掉 DB 欄位,不要讓單一檔案的錯誤卡住整批清理。
      }
    }
    const { error } = await supabase.rpc("clear_submission_audio", { p_submission_id: s.id });
    if (!error) cleared++;
  }

  revalidatePath("/admin/format");
  return { success: true, cleared };
}
