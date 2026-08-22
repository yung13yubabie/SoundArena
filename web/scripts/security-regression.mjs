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

  await admin.from("rounds").update({ submission_closes_at: new Date(Date.now() - 3600_000).toISOString() }).eq("id", roundA.id);
  const { error: closedSubErr } = await participantClient.rpc("submit_entry", {
    p_round_id: roundA.id,
    p_registration_id: reg.id,
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

  // ============ 7. 直接繞過 RPC 寫 submission_scores 被 GRANT 擋下 ============
  const { error: directScoreErr } = await judgeClient.from("submission_scores").upsert({ submission_id: sub.id, score_item_id: item.id, raw_value: 1, entered_by: judgeOnly.id });
  record("GRANT 收回: 繞過 RPC 直接寫 submission_scores 被拒絕", !!directScoreErr && directScoreErr.code === "42501", directScoreErr?.message);
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
