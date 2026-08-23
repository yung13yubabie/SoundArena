import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchNotificationEvent } from "@/lib/notifications";

// SA-005 通知功能保底:register/actions.ts、submit/actions.ts 在事件建立當下就會
// 立即嘗試送出,這裡是兜底——只處理當下嘗試失敗、還留在 pending 的事件(暫時性的
// 網路/API 錯誤,重試可能就成功)。Vercel Hobby 方案 cron 一天只能跑一次,所以絕大
// 多數通知應該是靠上面兩處的立即發送到達,不是靠這裡。
//
// 用 service_role(cron 沒有真正的使用者身份,dispatchNotificationEvent() 需要讀
// profiles.discord_user_id,那個欄位對 authenticated 完全不開放)。
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: events } = await supabase
    .from("notification_events")
    .select("id")
    .eq("status", "pending")
    .order("created_at")
    .limit(200);

  let processed = 0;
  for (const event of events ?? []) {
    await dispatchNotificationEvent(supabase, event.id);
    processed++;
  }

  return NextResponse.json({ ok: true, processed });
}
