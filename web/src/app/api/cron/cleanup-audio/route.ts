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

    let cleared = 0;
    for (const item of plan.toClear) {
      try {
        await deleteAudioObject(item.audioObjectKey);
      } catch {
        // B2 檔案沒刪成功也要繼續清掉 DB 欄位,不要讓單一檔案的錯誤卡住整批清理。
      }
      const { error } = await supabase.from("submissions").update({ audio_object_key: null }).eq("id", item.submissionId);
      if (!error) cleared++;
    }
    results.push({ competitionId: comp.id, name: comp.name, cleared });
  }

  return NextResponse.json({ ok: true, processed: results });
}
