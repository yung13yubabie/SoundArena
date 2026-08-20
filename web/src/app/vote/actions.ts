"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type ActionResult = { success: true } | { error: string };

async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "0.0.0.0";
}

export async function castVote(roundId: string, submissionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const voterIp = await getClientIp();

  // votes 的 INSERT 權限對 authenticated 全面收回(見 migration 20260820080000)——
  // voter_ip 只有這裡(瀏覽器直接打到的 Next.js 層)量得到真實值,Supabase 那一層
  // 看到的永遠是 Vercel 的連線 IP,所以這支 RPC 是唯一合法寫入路徑,用 service_role
  // 寫入,繞過 Next.js 直接打 PostgREST 的人會直接被拒絕,連偽造 voter_ip 的機會都沒有。
  const serviceClient = createServiceClient();
  const { error } = await serviceClient.from("votes").insert({
    round_id: roundId,
    submission_id: submissionId,
    voter_id: user.id,
    voter_ip: voterIp,
  });

  if (error) {
    if (error.code === "23505") {
      if (error.message.includes("voter_ip")) {
        return { error: "這個網路連線本輪已經投過票了(同網路只能投一票,避免灌票)" };
      }
      return { error: "你這輪已經投過票了" };
    }
    if (error.message.includes("cannot vote for your own submission")) {
      return { error: "不能投給自己的作品" };
    }
    return { error: error.message };
  }

  revalidatePath("/vote");
  return { success: true };
}
