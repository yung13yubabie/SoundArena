"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";
import { deleteAudioObject } from "@/lib/storage";
import { planAudioRetention } from "@/lib/audioRetention";

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

// SA-008 修復:原本依序做 4 個獨立呼叫(insert competition → RPC create_initial_rounds
// → insert scoring_rule → insert score items),中途任一步失敗,前面已成功的部分不會
// 自動 rollback,可能留下結構不完整的比賽殘留。改成單一 RPC(create_competition_full),
// 一次呼叫就是一個 transaction,任何一步失敗全部 rollback,不會有「建立了一半」的比賽。
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

  const { error } = await supabase.rpc("create_competition_full", {
    p_name: name,
    p_slug: slugify(name),
    p_default_anonymous: defaultAnonymous,
  });
  if (error) return { error: toFriendlyError(error) };

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
  if (error) {
    return {
      error: toFriendlyError(error, [
        {
          test: (m) => m.includes("already has real submissions"),
          friendly: "這一輪已經有真實投稿，無法自助移除——請透過「意見回饋」聯繫平台管理員協助處理",
        },
      ]),
    };
  }
  revalidatePath("/admin/format");
  return { success: true };
}

export interface RoundScheduleOverrideInput {
  submissionOpensAt: string;
  submissionClosesAt: string;
  votingOpensAt: string;
  votingClosesAt: string;
}

export async function setRoundScheduleOverride(roundId: string, input: RoundScheduleOverrideInput): Promise<ActionResult> {
  const supabase = await createClient();
  const orNull = (v: string) => (v === "" ? null : v);
  const { error } = await supabase.rpc("set_round_schedule_override", {
    p_round_id: roundId,
    p_submission_opens_at: orNull(input.submissionOpensAt),
    p_submission_closes_at: orNull(input.submissionClosesAt),
    p_voting_opens_at: orNull(input.votingOpensAt),
    p_voting_closes_at: orNull(input.votingClosesAt),
  });
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/admin/format");
  return { success: true };
}

export async function deleteCompetition(competitionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: orphanedAudioKeys, error } = await supabase.rpc("delete_competition", {
    p_competition_id: competitionId,
  });
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

  // DB-08 資安複查:一般 organizer 自助刪除時這場比賽必定沒有真實報名(RPC 端已擋),
  // 所以這裡通常是空陣列;只有 PlatformAdmin 繞過那道檢查強制刪除已有真實投稿的比賽時
  // 才會真的帶音檔 key——盡力立即清 B2,清不掉也沒關係,audio_pending_deletion 追蹤
  // 紀錄已經在 RPC 那邊寫入,cleanup-audio cron 會兜底重試。
  for (const key of orphanedAudioKeys ?? []) {
    try {
      await deleteAudioObject(key);
    } catch {
      // 留給 cron 重試,見上方註解
    }
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

  const plan = await planAudioRetention(supabase, competitionId);
  if (!plan.ended) {
    return { error: "比賽還沒完全結束（決賽投票尚未截止），還不能清除音檔" };
  }

  // SA-006 資安複查發現:舊版不管 B2 delete 有沒有成功都清掉 DB 的 audio_object_key,
  // 刪除失敗時等於永久丟失重試所需的 key,私人音檔可能悄悄留在 B2 卻再也找不到。
  // 修法很小:只有 B2 真的刪除成功才清 DB 欄位,失敗就整個跳過這筆——key 還留著,
  // 下一輪清理(手動或 cron)會因為 audio_object_key 還在而自然重新嘗試,不需要
  // 額外的 tombstone/retry 狀態表。
  let cleared = 0;
  for (const item of plan.toClear) {
    let b2Deleted = false;
    try {
      await deleteAudioObject(item.audioObjectKey);
      b2Deleted = true;
    } catch (err) {
      console.error(`B2 刪除失敗,保留 audio_object_key 供下次重試: ${item.audioObjectKey}`, err);
    }
    if (b2Deleted) {
      const { error } = await supabase.rpc("clear_submission_audio", { p_submission_id: item.submissionId });
      if (!error) cleared++;
    }
  }

  revalidatePath("/admin/format");
  return { success: true, cleared };
}
