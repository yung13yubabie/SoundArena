"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { toFriendlyError } from "@/lib/actionError";
import { deleteAudioObject } from "@/lib/storage";
import { planAudioRetention } from "@/lib/audioRetention";
import { dispatchPendingTeamNotifications } from "@/lib/notifications";
import { createCompetitionChannel, grantDiscordChannelAccess } from "@/lib/discord";
import { computeWildcardRevivalCandidates, computeWildcardRevivalOutcome } from "@/lib/wildcardRevival";

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

// ADR-0042:video_traffic 範本已經移除(SoundArena 沒有任何影片功能,這個選項
// 從建置以來就沒有真正的計分邏輯)——拿掉之後把權重併進 external_vote,維持總和 100%。
const DEFAULT_SCORE_ITEMS = [
  { templateKey: "vote", label: "投票", weightPercent: 40, sortOrder: 0 },
  { templateKey: "external_vote", label: "外部投票", weightPercent: 60, sortOrder: 1 },
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

  const { data: competitionId, error } = await supabase.rpc("create_competition_full", {
    p_name: name,
    p_slug: slugify(name),
    p_default_anonymous: defaultAnonymous,
  });
  if (error) return { error: toFriendlyError(error) };

  // 建立比賽自動開一個私人 Discord 頻道——最佳努力,失敗不影響比賽本身已經建立成功。
  // discord_channel_id 不開放給 authenticated 直接寫(見 migration 說明),用 service
  // client 才能寫入;讀主辦人 discord_user_id 同理,那個欄位對 authenticated 也不開放讀取。
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (guildId && competitionId) {
      const channelId = await createCompetitionChannel(guildId, name);
      const service = createServiceClient();
      await service.from("competitions").update({ discord_channel_id: channelId }).eq("id", competitionId);

      const { data: organizerProfile } = await service.from("profiles").select("discord_user_id").eq("id", user.id).maybeSingle();
      if (organizerProfile?.discord_user_id) {
        await grantDiscordChannelAccess(channelId, organizerProfile.discord_user_id);
      }
    }
  } catch {
    // Discord 頻道建立/授權失敗不影響比賽本身已經建立成功
  }

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

export async function setRoundEliminationPercent(roundId: string, percent: number | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_round_elimination_percent", { p_round_id: roundId, p_percent: percent });
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
    // elimination/grouping 改走 set_round_format_block() RPC——單一交易內做
    // 「已有賽程資料就鎖定/隊伍賽跟淘汰賽制相容性/循環賽必須搭配抽籤分組」的
    // 驗證,避免 Server Action 分開刪除+插入兩次呼叫之間出現中間態。
    const { error } = await supabase.rpc("set_round_format_block", {
      p_round_id: roundId,
      p_category: category,
      p_block_key: blockKey,
    });
    if (error) {
      return {
        error: toFriendlyError(error, [
          { test: (m) => m.includes("already has real schedule data"), friendly: "這一輪已經產生真實賽程資料或確認過結果，無法再變更淘汰方式/分組方式" },
          { test: (m) => m.includes("team grouping is not compatible"), friendly: "隊伍賽目前還不支援這種淘汰方式——配對邏輯是以個人為單位，不是以隊伍為單位" },
          { test: (m) => m.includes("round_robin requires lottery grouping"), friendly: "循環賽需要搭配「抽籤分組」才能運作，請先選抽籤分組" },
          { test: (m) => m.includes("already has an independent scoring rule override"), friendly: "這一輪已經有獨立評分規則，請先移除才能切成月/週期累積制" },
        ]),
      };
    }
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
  const { data: orphanedAudioKeys, error } = await supabase.rpc("remove_round", { p_round_id: roundId });
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

  // Codex adversarial review 抓到:一般 organizer 移除的輪次必定沒有真實投稿(RPC 端
  // 已擋),這裡通常是空陣列;只有 PlatformAdmin 強制移除有真實投稿的輪次才會真的
  // 帶音檔 key——盡力立即清 B2,清不掉也沒關係,audio_pending_deletion 追蹤紀錄已經
  // 在 RPC 那邊寫入,cleanup-audio cron 會兜底重試(見 ADR-0035/DB-08 同一套模式)。
  for (const key of orphanedAudioKeys ?? []) {
    try {
      await deleteAudioObject(key);
    } catch {
      // 留給 cron 重試,見上方註解
    }
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
    if (error || !rule) {
      return {
        error: error
          ? toFriendlyError(error, [
              { test: (m) => m.includes("periodic_accumulation rounds cannot use an independent scoring rule"), friendly: "這一輪是月/週期累積制，不能使用獨立評分規則——累積分數的合併邏輯要求整個賽段共用同一份規則" },
            ])
          : "建立覆寫規則失敗",
      };
    }
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

export async function swapTeamMember(registrationId: string, newTeamId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("swap_team_member", {
    p_registration_id: registrationId,
    p_new_team_id: newTeamId,
  });
  if (error) return { error: toFriendlyError(error) };

  try {
    const { data: team } = await supabase
      .from("teams")
      .select("round_id, rounds(competition_id)")
      .eq("id", newTeamId)
      .single();
    const round = team?.rounds as { competition_id: string } | { competition_id: string }[] | null;
    const competitionId = Array.isArray(round) ? round[0]?.competition_id : round?.competition_id;
    if (competitionId) await dispatchPendingTeamNotifications([competitionId]);
  } catch {
    // 換組後的通知立即送出失敗不影響換組本身已經成功,留給每日 cron 兜底
  }

  revalidatePath("/admin/format");
  return { success: true };
}

export async function transferTeamCaptain(teamId: string, newCaptainRegistrationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_team_captain", {
    p_team_id: teamId,
    p_new_captain_registration_id: newCaptainRegistrationId,
  });
  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/admin/format");
  return { success: true };
}

// 外卡復活——候選名單是「觸發當下最近一次確認結果的那一輪」,取前 candidateN 名
// (離晉級線最近),整場比賽限用一次(RPC 端用 unique(competition_id) 保證)。
export async function openWildcardRevival(competitionId: string, candidateN: number, opensAt: string, closesAt: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: sourceRound } = await supabase
    .from("rounds")
    .select("id")
    .eq("competition_id", competitionId)
    .not("results_finalized_at", "is", null)
    .order("round_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sourceRound) return { error: "目前還沒有任何一輪確認過結果，無法開啟外卡復活投票" };

  const candidateIds = await computeWildcardRevivalCandidates(supabase, competitionId, sourceRound.id, candidateN);
  if (candidateIds.length === 0) return { error: "找不到候選人（最近一輪確認結果沒有人被淘汰）" };

  const { error } = await supabase.rpc("open_wildcard_revival_event", {
    p_competition_id: competitionId,
    p_source_round_id: sourceRound.id,
    p_candidate_registration_ids: candidateIds,
    p_voting_opens_at: opensAt,
    p_voting_closes_at: closesAt,
  });
  if (error) {
    return {
      error: toFriendlyError(error, [
        { test: (_m, c) => c === "23505", friendly: "這場比賽已經用過外卡復活了,整場限用一次" },
        { test: (m) => m.includes("next round pairing has already been formed"), friendly: "下一輪的分組/配對已經產生,這次機會已經錯過(比賽後續其他輪次確認結果後可以再試)" },
        { test: (m) => m.includes("source round has not been finalized"), friendly: "這一輪還沒確認結果" },
        { test: (m) => m.includes("invalid voting window"), friendly: "投票時間設定不正確" },
      ]),
    };
  }

  revalidatePath("/admin/format");
  return { success: true };
}

export async function extendWildcardRevivalVoting(eventId: string, newClosesAt: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("extend_wildcard_revival_voting", { p_event_id: eventId, p_new_closes_at: newClosesAt });
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/admin/format");
  return { success: true };
}

// 確認外卡復活結果——票數最高的候選人贏,平手就整個拒絕確認,比照單敗/雙敗淘汰
// 「確認本輪結果」平手擋下的處理模式。
export async function finalizeWildcardRevival(eventId: string): Promise<ActionResult> {
  const outcome = await computeWildcardRevivalOutcome(eventId);
  if (!outcome.ok) {
    const tiedList = outcome.tiedCandidates.map((c) => `${c.displayName}(${c.votes}票)`).join("、");
    return { error: `最高票平手,無法決定復活者:${tiedList}。請延長投票時間,等更多人投票後再重新確認` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_wildcard_revival_event", {
    p_event_id: eventId,
    p_winner_registration_id: outcome.winnerRegistrationId,
  });
  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/admin/format");
  revalidatePath("/status");
  return { success: true };
}
