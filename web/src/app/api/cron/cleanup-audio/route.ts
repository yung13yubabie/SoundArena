import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { planAudioRetention } from "@/lib/audioRetention";
import { deleteAudioObject } from "@/lib/storage";

// Vercel Cron 每天呼叫一次,找出「決賽投票已截止但還有非前三名音檔沒清」的比賽,
// 自動執行留存清理——手動觸發版本(admin/format/actions.ts 的
// cleanupNonFinalistAudio)還在,主辦人隨時可以自己先清,這支是保底,避免主辦人
// 忘記手動清就一直留著。
//
// 用 service_role 直接寫 DB(不透過 clear_submission_audio() RPC)——那支 RPC
// 靠 can_manage_competition() 判斷權限,而 can_manage_competition() 依賴
// auth.uid(),cron job 沒有真正的使用者身份,auth.uid() 會是 null,一定會被
// RPC 擋下來。service_role 本來就不受 RLS/GRANT 限制,直接寫表格是正確做法,
// 不是繞過安全機制——這是一個真正的系統背景工作,不是偽裝成使用者的請求。
//
// 用 CRON_SECRET 驗證呼叫者真的是 Vercel Cron,不是任何人都能打這支端點
// (照 Vercel 官方文件的建議做法)。
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: competitions } = await supabase.from("competitions").select("id, name");
  const results: Array<{ competitionId: string; name: string; cleared: number }> = [];

  for (const comp of competitions ?? []) {
    const plan = await planAudioRetention(supabase, comp.id);
    if (!plan.ended || plan.toClear.length === 0) continue;

    // SA-006 修復:只有 B2 真的刪除成功才清 DB 欄位,失敗就跳過——key 還留著,
    // 下一次 cron 執行會因為 audio_object_key 還在而自然重試,不用額外的重試狀態。
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
        const { error } = await supabase.from("submissions").update({ audio_object_key: null }).eq("id", item.submissionId);
        if (!error) cleared++;
      }
    }
    results.push({ competitionId: comp.id, name: comp.name, cleared });
  }

  // SA-003 剩餘項目:清掉「申請了 upload URL、可能也真的上傳了檔案,但從沒被任何
  // submit_entry() 吃掉」的孤兒物件——48 小時的緩衝期是為了不要清掉使用者正在
  // 填表單、還沒送出投稿的合法上傳。B2 的 DeleteObject 對不存在的 key 是
  // idempotent 成功,所以「使用者拿到 URL 但根本沒上傳」的情況這裡也會自然清乾淨。
  const orphanCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: orphans } = await supabase
    .from("pending_uploads")
    .select("id, object_key")
    .is("consumed_at", null)
    .lt("created_at", orphanCutoff);

  let orphansCleared = 0;
  for (const orphan of orphans ?? []) {
    let b2Deleted = false;
    try {
      await deleteAudioObject(orphan.object_key);
      b2Deleted = true;
    } catch (err) {
      console.error(`孤兒上傳物件刪除失敗,保留紀錄供下次重試: ${orphan.object_key}`, err);
    }
    if (b2Deleted) {
      const { error } = await supabase.from("pending_uploads").delete().eq("id", orphan.id);
      if (!error) orphansCleared++;
    }
  }

  // DB-08 資安複查:delete_own_submission()/delete_competition() 刪除整列時,把
  // 即將留在 B2 的 audio_object_key 寫進 audio_pending_deletion(見 ADR-0034 之後
  // 的追蹤表 migration)——這裡是唯一真正負責把這些追蹤紀錄清掉的地方,跟上面
  // pending_uploads 孤兒掃描同一套「B2 真的刪成功才清 DB 紀錄」邏輯。不需要緩衝期
  // (不像 pending_uploads 要等 48 小時避免誤刪還在填表單的合法上傳,這裡寫入的
  // 都是使用者/PlatformAdmin 已經確定要刪除的資源)。
  const { data: pendingDeletions } = await supabase
    .from("audio_pending_deletion")
    .select("id, object_key");

  let pendingDeletionsCleared = 0;
  for (const item of pendingDeletions ?? []) {
    let b2Deleted = false;
    try {
      await deleteAudioObject(item.object_key);
      b2Deleted = true;
    } catch (err) {
      console.error(`待刪除音檔清除失敗,保留追蹤紀錄供下次重試: ${item.object_key}`, err);
    }
    if (b2Deleted) {
      const { error } = await supabase.from("audio_pending_deletion").delete().eq("id", item.id);
      if (!error) pendingDeletionsCleared++;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results,
    orphansCleared,
    orphansFound: (orphans ?? []).length,
    pendingDeletionsCleared,
    pendingDeletionsFound: (pendingDeletions ?? []).length,
  });
}
