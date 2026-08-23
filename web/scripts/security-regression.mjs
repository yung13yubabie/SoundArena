#!/usr/bin/env node
// SA-004:自動化安全回歸測試——把這個 session 手動 PoC 過的 Role × Resource × Action
// 邊界收斂成可重複執行的腳本,防止之後的修改重新打開已經修好的權限漏洞。
//
// 讀取環境變數(不把任何金鑰寫死進這個檔案,這個檔案會進版控):
//   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
// 本機開發沒有另外 export 時,自動從 web/.env.local 讀(.env.local 本身不進版控)。
// CI 環境從 GitHub Actions secrets 注入。
//
// 用一次性測試帳號 + 真實 RLS/RPC 呼叫驗證,不用 service_role 偽造結果;結束後
// 無論成功失敗都會清掉全部測試資料。

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvIfNeeded() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotEnvIfNeeded();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("缺少必要環境變數(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const PW = `Sec-Test-${Math.random().toString(36).slice(2)}!Aa1`;

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

const cleanupUserIds = [];
const cleanupCompetitionIds = [];

async function makeUser(label) {
  const email = `secreg-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  cleanupUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function clientFor(email) {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function approveOrganizer(userId) {
  await admin.from("profiles").update({ host_approved_at: new Date().toISOString() }).eq("id", userId);
}

async function makeCompetition(organizerId, label) {
  const { data: comp, error } = await admin
    .from("competitions")
    .insert({ organizer_id: organizerId, name: `SecReg ${label}`, slug: `secreg-${label}-${Date.now()}`, is_public: true })
    .select("id")
    .single();
  if (error) throw new Error(`create competition ${label}: ${error.message}`);
  cleanupCompetitionIds.push(comp.id);
  return comp.id;
}

async function main() {
  // ============ 共用測試治具 ============
  const organizerA = await makeUser("organizerA");
  const organizerB = await makeUser("organizerB");
  const judgeOnly = await makeUser("judgeonly");
  const reviewOnly = await makeUser("reviewonly");
  const participant = await makeUser("participant");

  await approveOrganizer(organizerA.id);
  await approveOrganizer(organizerB.id);

  const compA = await makeCompetition(organizerA.id, "compA");
  const compB = await makeCompetition(organizerB.id, "compB");

  const { data: roundA } = await admin
    .from("rounds")
    .insert({
      competition_id: compA,
      round_index: 1,
      name: "初賽",
      is_anonymous: true,
      voting_opens_at: new Date(Date.now() - 60_000).toISOString(),
      voting_closes_at: new Date(Date.now() + 3600_000).toISOString(),
    })
    .select("id")
    .single();

  await admin.from("competition_collaborators").insert([
    { competition_id: compA, user_id: judgeOnly.id, can_judge: true, can_review: false, can_edit_format: false, can_edit_schedule: false, can_invite: false },
    { competition_id: compA, user_id: reviewOnly.id, can_judge: false, can_review: true, can_edit_format: false, can_edit_schedule: false, can_invite: false },
  ]);

  const { data: reg } = await admin
    .from("registrations")
    .insert({ competition_id: compA, user_id: participant.id, display_name: "真實身份不該外洩", suno_handle: "secreg-handle", review_status: "approved", status: "active" })
    .select("id")
    .single();

  const { data: sub } = await admin
    .from("submissions")
    .insert({ round_id: roundA.id, registration_id: reg.id, suno_share_url: "https://suno.com/s/secreg001", title: "SecReg 測試曲", sharer_handle: "secreg-handle", status: "approved", allow_public_playback: false })
    .select("id")
    .single();

  const organizerAClient = await clientFor(organizerA.email);
  const organizerBClient = await clientFor(organizerB.email);
  const judgeClient = await clientFor(judgeOnly.email);
  const reviewClient = await clientFor(reviewOnly.email);
  const participantClient = await clientFor(participant.email);

  // ============ 1. 跨租戶隔離:Organizer B 不能管理 Organizer A 的比賽;A 自己可以 ============
  const { error: crossTenantErr } = await organizerBClient.rpc("update_competition_name", { p_competition_id: compA, p_name: "被別人改的名字" });
  record("跨租戶隔離: Organizer B 無法改 Organizer A 的比賽名稱", !!crossTenantErr, crossTenantErr?.message);

  const { data: nameAfter } = await admin.from("competitions").select("name").eq("id", compA).single();
  record("跨租戶隔離(獨立複查): 比賽名稱真的沒被改掉", nameAfter.name === "SecReg compA", `name=${nameAfter.name}`);

  const { error: legitRenameErr } = await organizerAClient.rpc("update_competition_name", { p_competition_id: compA, p_name: "SecReg compA renamed" });
  record("回歸: Organizer A 自己可以正常改自己比賽的名稱", !legitRenameErr, legitRenameErr?.message);

  // ============ 2. Judge-only 協作者:能評分,不能讀身份 ============
  const { data: judgeDirectRead } = await judgeClient.from("registrations").select("display_name, suno_handle").eq("id", reg.id);
  record("Judge 匿名性: judge-only 協作者直接查 registrations 拿不到任何列", (judgeDirectRead ?? []).length === 0);

  const { data: judgeRpcRead, error: judgeRpcErr } = await judgeClient.rpc("judge_submissions_for_round", { p_round_id: roundA.id });
  const judgeRow = (judgeRpcRead ?? [])[0];
  record(
    "Judge 匿名性: judge_submissions_for_round() 正常運作且不含身份欄位",
    !judgeRpcErr && !!judgeRow && !("display_name" in judgeRow) && !("suno_handle" in judgeRow),
    judgeRpcErr?.message,
  );

  // ============ DB-03: judge-only 協作者(自己從未申請/通過 Organizer 審核)
  // 仍然要能透過 get_manageable_competitions() 拿到被邀請的比賽,不能被
  // host 審核閘卡死——這是 admin/judge/format/schedule/review/collaborators
  // 五個頁面共用的授權資料來源,頁面本身的 redirect 邏輯就是看這個結果是否為空。
  const { data: judgeOnlyProfile } = await admin.from("profiles").select("host_approved_at").eq("id", judgeOnly.id).maybeSingle();
  const { data: judgeManageable, error: judgeManageableErr } = await judgeClient.rpc("get_manageable_competitions", { p_permission: "judge" });
  record(
    "DB-03: judge-only 協作者從未通過 Organizer 審核,但 get_manageable_competitions('judge') 仍正確回傳被邀請的比賽",
    judgeOnlyProfile?.host_approved_at === null && !judgeManageableErr && (judgeManageable ?? []).some((c) => c.id === compA),
    `host_approved_at=${judgeOnlyProfile?.host_approved_at} error=${judgeManageableErr?.message ?? "none"} rows=${(judgeManageable ?? []).length}`,
  );
  const { data: judgeReviewManageable } = await judgeClient.rpc("get_manageable_competitions", { p_permission: "review" });
  record(
    "DB-03(回歸): 同一個 judge-only 協作者查 'review' 權限正確拿到空清單(沒有被過度放行)",
    (judgeReviewManageable ?? []).length === 0,
    `rows=${(judgeReviewManageable ?? []).length}`,
  );

  // ============ 3. Review-only 協作者:能看身份,不能評分 ============
  const { data: reviewRead, error: reviewErr } = await reviewClient.from("registrations").select("display_name").eq("id", reg.id).maybeSingle();
  record("Review 權限: review-only 協作者能看到真實身份(合法用途)", !reviewErr && reviewRead?.display_name === "真實身份不該外洩", reviewErr?.message);

  // 建一個 bonus score item 讓 review-only 嘗試打分(應該被擋,因為他沒有 judge 權限)
  const { data: rule } = await admin.from("scoring_rules").insert({ competition_id: compA, round_id: null }).select("id").single();
  const { data: bonusTempl } = await admin.from("score_item_templates").select("id").eq("key", "manual_bonus").single();
  const { data: item } = await admin
    .from("score_items")
    .insert({ scoring_rule_id: rule.id, template_id: bonusTempl.id, label: "測試加分", kind: "bonus", weight_percent: null, sort_order: 0 })
    .select("id")
    .single();

  const { error: reviewScoreErr } = await reviewClient.rpc("save_submission_score", { p_submission_id: sub.id, p_score_item_id: item.id, p_raw_value: 10 });
  record("權限子集: review-only 協作者不能打分(沒有 judge 權限)", !!reviewScoreErr, reviewScoreErr?.message);

  const { error: judgeScoreErr } = await judgeClient.rpc("save_submission_score", { p_submission_id: sub.id, p_score_item_id: item.id, p_raw_value: 8 });
  record("回歸: judge-only 協作者可以正常打分", !judgeScoreErr, judgeScoreErr?.message);

  // ============ 4. SA-007: score_item 跨 scoring_rule 驗證 ============
  const { data: ruleB } = await admin.from("scoring_rules").insert({ competition_id: compB, round_id: null }).select("id").single();
  const { data: itemB } = await admin
    .from("score_items")
    .insert({ scoring_rule_id: ruleB.id, template_id: bonusTempl.id, label: "compB 的加分項", kind: "bonus", weight_percent: null, sort_order: 0 })
    .select("id")
    .single();
  const { error: crossRuleErr } = await judgeClient.rpc("save_submission_score", { p_submission_id: sub.id, p_score_item_id: itemB.id, p_raw_value: 999 });
  record("SA-007: 塞入不屬於這個 submission 適用 scoring_rule 的 score_item 被拒絕", !!crossRuleErr, crossRuleErr?.message);

  // ============ 5. SA-002: 報名/投稿截止時間 DB 層強制 ============
  await admin.from("competitions").update({ registration_closes_at: new Date(Date.now() - 3600_000).toISOString() }).eq("id", compA);
  const strangerForReg = await makeUser("strangerreg");
  const strangerClient = await clientFor(strangerForReg.email);
  const { error: closedRegErr } = await strangerClient.from("registrations").insert({ competition_id: compA, user_id: strangerForReg.id, display_name: "太晚了", suno_handle: "too-late" });
  record("SA-002: 報名截止後 insert 被 DB 拒絕", closedRegErr?.code === "42501", closedRegErr?.message);
  await admin.from("competitions").update({ registration_closes_at: null }).eq("id", compA);

  // submit_entry() 在 DB-02 修復後只留 service_role(見下面專門的 DB-02 區塊),
  // 這裡改用 admin client 呼叫,單純驗證「截止時間」這個 DB invariant 本身還在,
  // 跟「誰能呼叫這支 RPC」是兩件事分開測。
  await admin.from("rounds").update({ submission_closes_at: new Date(Date.now() - 3600_000).toISOString() }).eq("id", roundA.id);
  const { error: closedSubErr } = await admin.rpc("submit_entry", {
    p_round_id: roundA.id,
    p_registration_id: reg.id,
    p_caller_user_id: participant.id,
    p_suno_share_url: "https://suno.com/s/secreg002",
    p_title: "截止後投稿",
    p_cover_image_url: null,
    p_sharer_handle: "secreg-handle",
    p_lyrics: "",
    p_allow_public_playback: false,
  });
  record("SA-002: 投稿截止後 submit_entry() 被 DB 拒絕", !!closedSubErr && closedSubErr.message.includes("closed"), closedSubErr?.message);
  await admin.from("rounds").update({ submission_closes_at: null }).eq("id", roundA.id);

  // ============ 6. Vote 有效性:不能投自己、不能重複投 ============
  const { error: selfVoteErr } = await admin.from("votes").insert({ round_id: roundA.id, submission_id: sub.id, voter_id: participant.id, voter_ip: "10.0.0.99" });
  record("Vote: 不能投給自己的作品", !!selfVoteErr && selfVoteErr.message.includes("own submission"), selfVoteErr?.message);

  const voterX = await makeUser("voterX");
  const { error: firstVoteErr } = await admin.from("votes").insert({ round_id: roundA.id, submission_id: sub.id, voter_id: voterX.id, voter_ip: "10.0.0.100" });
  const { error: dupVoteErr } = await admin.from("votes").insert({ round_id: roundA.id, submission_id: sub.id, voter_id: voterX.id, voter_ip: "10.0.0.101" });
  record("回歸: 正常投票成功", !firstVoteErr, firstVoteErr?.message);
  record("Vote: 同一人同一輪不能投兩次", !!dupVoteErr && dupVoteErr.code === "23505", dupVoteErr?.message);

  // ============ DB-02: submit_entry() 只留 service_role,直接繞過
  // Next.js Server Action 的 Suno/MIME 驗證,對 PostgREST 打 RPC 應該被拒絕 ============
  const { data: extraRound } = await admin
    .from("rounds")
    .insert({ competition_id: compA, round_index: 2, name: "DB-02 測試輪", is_anonymous: false })
    .select("id")
    .single();
  const { error: directSubmitErr } = await participantClient.rpc("submit_entry", {
    p_round_id: extraRound.id,
    p_registration_id: reg.id,
    p_caller_user_id: participant.id,
    p_suno_share_url: "https://suno.com/s/db02bypass",
    p_title: "繞過驗證的投稿",
    p_cover_image_url: null,
    p_sharer_handle: "secreg-handle",
    p_lyrics: "",
    p_allow_public_playback: false,
  });
  record(
    "DB-02: 一般 authenticated session 直接呼叫 submit_entry() 被拒絕(只留 service_role)",
    !!directSubmitErr && directSubmitErr.code === "42501",
    `error=${directSubmitErr?.message ?? "none"} code=${directSubmitErr?.code}`,
  );

  const { data: legitSubmitId, error: legitSubmitErr } = await admin.rpc("submit_entry", {
    p_round_id: extraRound.id,
    p_registration_id: reg.id,
    p_caller_user_id: participant.id,
    p_suno_share_url: "https://suno.com/s/db02legit",
    p_title: "service_role 正常呼叫",
    p_cover_image_url: null,
    p_sharer_handle: "secreg-handle",
    p_lyrics: "",
    p_allow_public_playback: false,
  });
  record(
    "回歸: service_role 帶正確 p_caller_user_id 呼叫 submit_entry() 正常成功(模擬 Server Action 的合法路徑)",
    !legitSubmitErr && !!legitSubmitId,
    `error=${legitSubmitErr?.message ?? "none"}`,
  );

  const { error: wrongOwnerErr } = await admin.rpc("submit_entry", {
    p_round_id: extraRound.id,
    p_registration_id: reg.id,
    p_caller_user_id: judgeOnly.id,
    p_suno_share_url: "https://suno.com/s/db02wrongowner",
    p_title: "冒充別人的 caller_user_id",
    p_cover_image_url: null,
    p_sharer_handle: "secreg-handle",
    p_lyrics: "",
    p_allow_public_playback: false,
  });
  record(
    "DB-02(回歸): 就算用 service_role 呼叫,p_caller_user_id 跟 registration 擁有者不符也會被拒絕",
    !!wrongOwnerErr && wrongOwnerErr.message.includes("not your registration"),
    `error=${wrongOwnerErr?.message ?? "none"}`,
  );

  // ============ 7. 直接繞過 RPC 寫 submission_scores 被 GRANT 擋下 ============
  const { error: directScoreErr } = await judgeClient.from("submission_scores").upsert({ submission_id: sub.id, score_item_id: item.id, raw_value: 1, entered_by: judgeOnly.id });
  record("GRANT 收回: 繞過 RPC 直接寫 submission_scores 被拒絕", !!directScoreErr && directScoreErr.code === "42501", directScoreErr?.message);

  // ============ DB-08: delete_own_submission()/delete_competition() 刪除整列時,
  // 該留在 B2 的 audio_object_key 要真的被寫進 audio_pending_deletion 追蹤表,不能
  // 隨著那一列消失就變成完全沒有紀錄的孤兒。這裡只驗證 DB 端的追蹤紀錄本身,不碰
  // 真實 B2(CI 的 ci-security-test environment 沒有配置 B2 憑證,真實刪除驗證見
  // 一次性 PoC,結論記在 ADR-0034 之後的 DB-08 ADR)。
  const dbo8FakeKeyA = `secreg-db08/${Date.now()}-a.mp3`;
  const { data: db08Round } = await admin
    .from("rounds")
    .insert({ competition_id: compA, round_index: 3, name: "DB-08 測試輪", is_anonymous: false })
    .select("id")
    .single();
  const { data: db08Sub } = await admin
    .from("submissions")
    .insert({ round_id: db08Round.id, registration_id: reg.id, suno_share_url: "https://suno.com/s/db08sub", audio_object_key: dbo8FakeKeyA, status: "approved" })
    .select("id")
    .single();
  const { data: db08ReturnedKey, error: db08DeleteErr } = await participantClient.rpc("delete_own_submission", { p_submission_id: db08Sub.id });
  const { data: db08PendingRows } = await admin.from("audio_pending_deletion").select("id, object_key, reason").eq("object_key", dbo8FakeKeyA);
  record(
    "DB-08: delete_own_submission() 把即將孤兒的 audio_object_key 寫進 audio_pending_deletion",
    !db08DeleteErr && db08ReturnedKey === dbo8FakeKeyA && (db08PendingRows ?? []).length === 1 && db08PendingRows[0].reason === "submission_delete",
    `error=${db08DeleteErr?.message ?? "none"} returned=${db08ReturnedKey} rows=${(db08PendingRows ?? []).length}`,
  );

  const platformAdmin = await makeUser("platformadmin");
  await admin.from("profiles").update({ is_platform_admin: true }).eq("id", platformAdmin.id);
  const platformAdminClient = await clientFor(platformAdmin.email);

  const compC = await makeCompetition(organizerA.id, "compC");
  const { data: compCRound } = await admin.from("rounds").insert({ competition_id: compC, round_index: 1, name: "R1" }).select("id").single();
  const participantC = await makeUser("participantC");
  const { data: regC } = await admin
    .from("registrations")
    .insert({ competition_id: compC, user_id: participantC.id, display_name: "DB-08 compC", suno_handle: "db08-c" })
    .select("id")
    .single();
  const dbo8FakeKeyB = `secreg-db08/${Date.now()}-b.mp3`;
  await admin.from("submissions").insert({ round_id: compCRound.id, registration_id: regC.id, suno_share_url: "https://suno.com/s/db08compc", audio_object_key: dbo8FakeKeyB, status: "approved" });

  const { error: db08BlockedErr } = await organizerAClient.rpc("delete_competition", { p_competition_id: compC });
  record(
    "回歸(DB-08): 一般 organizer 對有真實報名的比賽仍被擋下",
    !!db08BlockedErr && db08BlockedErr.message.includes("already has real registrations"),
    db08BlockedErr?.message,
  );

  const { data: db08ReturnedKeys, error: db08ForceDeleteErr } = await platformAdminClient.rpc("delete_competition", { p_competition_id: compC });
  const { data: db08CompCAfter } = await admin.from("competitions").select("id").eq("id", compC).maybeSingle();
  const { data: db08PendingRowsB } = await admin.from("audio_pending_deletion").select("id, reason").eq("object_key", dbo8FakeKeyB);
  record(
    "DB-08: PlatformAdmin 強制刪除有真實投稿的比賽,回傳 audio_object_key 陣列且寫進追蹤表",
    !db08ForceDeleteErr &&
      Array.isArray(db08ReturnedKeys) &&
      db08ReturnedKeys.includes(dbo8FakeKeyB) &&
      db08CompCAfter === null &&
      (db08PendingRowsB ?? []).length === 1 &&
      db08PendingRowsB[0].reason === "competition_delete",
    `error=${db08ForceDeleteErr?.message ?? "none"} returned=${JSON.stringify(db08ReturnedKeys)}`,
  );

  const { error: db08DirectReadErr } = await participantClient.from("audio_pending_deletion").select("id").limit(1);
  record("DB-08: 一般 authenticated 角色無法直接讀 audio_pending_deletion", !!db08DirectReadErr, db08DirectReadErr?.message);

  await admin.from("audio_pending_deletion").delete().in("object_key", [dbo8FakeKeyA, dbo8FakeKeyB]);

  // ============ remove_round(): 一般 organizer 不能移除已有真實投稿的中間輪次,
  // PlatformAdmin 可以強制;首輪/末輪任何人都不能移除。獨立建一個比賽測試,避免
  // 干擾 compA 上面其他測試已經用掉的輪次順序。 ============
  const compRR = await makeCompetition(organizerA.id, "removeRound");
  const { data: rrR1 } = await admin.from("rounds").insert({ competition_id: compRR, round_index: 1, name: "初賽" }).select("id").single();
  const { data: rrR2 } = await admin.from("rounds").insert({ competition_id: compRR, round_index: 2, name: "複賽" }).select("id").single();
  await admin.from("rounds").insert({ competition_id: compRR, round_index: 3, name: "決賽" });
  const { data: rrReg } = await admin
    .from("registrations")
    .insert({ competition_id: compRR, user_id: organizerA.id, suno_handle: "rr-handle", display_name: "RemoveRound 測試" })
    .select("id")
    .single();
  const rrAudioKey = `secreg-rr/${Date.now()}.mp3`;
  await admin.from("submissions").insert({ round_id: rrR2.id, registration_id: rrReg.id, suno_share_url: "https://suno.com/s/removeround", audio_object_key: rrAudioKey, status: "approved" });

  const { error: rrBlockedErr } = await organizerAClient.rpc("remove_round", { p_round_id: rrR2.id });
  record(
    "remove_round(): 一般 organizer 移除有真實投稿的中間輪次被擋下",
    !!rrBlockedErr && rrBlockedErr.message.includes("already has real submissions"),
    rrBlockedErr?.message,
  );

  const { data: rrReturnedKeys, error: rrForceErr } = await platformAdminClient.rpc("remove_round", { p_round_id: rrR2.id });
  const { data: rrR2After } = await admin.from("rounds").select("id").eq("id", rrR2.id).maybeSingle();
  record(
    "remove_round(): PlatformAdmin 可強制移除有真實投稿的中間輪次",
    !rrForceErr && rrR2After === null,
    `error=${rrForceErr?.message ?? "none"}`,
  );

  // Codex adversarial review 抓到:強制移除的輪次底下投稿的 audio_object_key 沒有
  // 被追蹤,B2 音檔會變成永久孤兒(見 ADR-0035/DB-08 的 audio_pending_deletion)。
  const { data: rrPendingRows } = await admin.from("audio_pending_deletion").select("id, reason").eq("object_key", rrAudioKey);
  record(
    "remove_round(): 強制移除輪次底下投稿的 audio_object_key 寫進 audio_pending_deletion",
    Array.isArray(rrReturnedKeys) && rrReturnedKeys.includes(rrAudioKey) && (rrPendingRows ?? []).length === 1 && rrPendingRows[0].reason === "round_delete",
    `returned=${JSON.stringify(rrReturnedKeys)} rows=${(rrPendingRows ?? []).length}`,
  );
  await admin.from("audio_pending_deletion").delete().eq("object_key", rrAudioKey);

  const { error: rrFirstRoundErr } = await platformAdminClient.rpc("remove_round", { p_round_id: rrR1.id });
  record(
    "remove_round(回歸): 就算是 PlatformAdmin 也不能移除第一輪",
    !!rrFirstRoundErr && rrFirstRoundErr.message.includes("初賽與決賽不可移除"),
    rrFirstRoundErr?.message,
  );

  // ============ DB-09(b): set_round_schedule_override() 讓單一輪次可以有專屬時程,
  // 陌生人不能設定別人比賽的輪次。 ============
  const compRSO = await makeCompetition(organizerA.id, "roundScheduleOverride");
  const { data: rsoR1 } = await admin.from("rounds").insert({ competition_id: compRSO, round_index: 1, name: "R1" }).select("id").single();
  const rsoWindow = {
    p_submission_opens_at: "2026-09-01T02:00:00.000Z",
    p_submission_closes_at: "2026-09-05T14:00:00.000Z",
    p_voting_opens_at: "2026-09-06T02:00:00.000Z",
    p_voting_closes_at: "2026-09-10T14:00:00.000Z",
  };
  const { error: rsoSetErr } = await organizerAClient.rpc("set_round_schedule_override", { p_round_id: rsoR1.id, ...rsoWindow });
  const { data: rsoAfter } = await admin.from("rounds").select("submission_opens_at").eq("id", rsoR1.id).single();
  record(
    "DB-09(b): organizer 可設定自己輪次的專屬時程",
    !rsoSetErr && new Date(rsoAfter.submission_opens_at).getTime() === new Date(rsoWindow.p_submission_opens_at).getTime(),
    `error=${rsoSetErr?.message ?? "none"}`,
  );

  const { error: rsoStrangerErr } = await organizerBClient.rpc("set_round_schedule_override", { p_round_id: rsoR1.id, ...rsoWindow });
  record(
    "DB-09(b): 陌生人不能設定別人比賽的輪次專屬時程",
    !!rsoStrangerErr && rsoStrangerErr.message.includes("insufficient permission"),
    rsoStrangerErr?.message,
  );
}

async function cleanup() {
  for (const id of cleanupCompetitionIds) {
    await admin.from("competitions").delete().eq("id", id);
  }
  for (const id of cleanupUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
}

main()
  .catch((e) => {
    console.error("安全回歸測試執行中發生未預期錯誤:", e);
    record("執行過程", false, String(e));
  })
  .finally(async () => {
    await cleanup();
    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== 安全回歸測試總結:${results.length - failed.length}/${results.length} 通過 ===`);
    if (failed.length) {
      console.log("失敗項目:", failed.map((f) => f.name).join(", "));
      process.exitCode = 1;
    }
  });
