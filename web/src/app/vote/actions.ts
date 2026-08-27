"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { toFriendlyError } from "@/lib/actionError";

type ActionResult = { success: true } | { error: string };

async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "0.0.0.0";
}

export async function castVote(roundId: string, submissionId: string, aiUsageRating: number | null): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  if (aiUsageRating !== null && (!Number.isInteger(aiUsageRating) || aiUsageRating < 1 || aiUsageRating > 5)) {
    return { error: "AI 使用方式評分必須是 1 到 5 的整數" };
  }

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
    ai_usage_rating: aiUsageRating,
  });

  if (error) {
    return {
      error: toFriendlyError(error, [
        { test: (_m, c) => c === "23505", friendly: (error.message.includes("voter_ip")
          ? "這個網路連線本輪已經投過票了（同網路只能投一票，避免灌票）——如果你是跟朋友共用 wifi，可以試試切換成行動網路再投一次"
          : "你這輪已經投過票了") },
        { test: (m) => m.includes("cannot vote for your own submission"), friendly: "不能投給自己的作品" },
        { test: (m) => m.includes("not approved for voting"), friendly: "這個作品還沒有審核通過，不能投票" },
        { test: (m) => m.includes("has been eliminated"), friendly: "這位參賽者已被淘汰，不能再投票" },
        { test: (m) => m.includes("voting has not opened"), friendly: "這一輪投票還沒開始" },
        { test: (m) => m.includes("voting has closed"), friendly: "這一輪投票已經結束" },
      ]),
    };
  }

  revalidatePath("/vote");
  return { success: true };
}

// 循環賽配對投票——跟 castVote() 同一個理由:match_votes 沒有開放任何 authenticated
// INSERT policy(voter_ip 只有這裡量得到真實值),寫入一定要走 service_role。
export async function castMatchVote(matchId: string, chosenRegistrationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const voterIp = await getClientIp();

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.from("match_votes").insert({
    match_id: matchId,
    voter_id: user.id,
    voter_ip: voterIp,
    chosen_registration_id: chosenRegistrationId,
  });

  if (error) {
    return {
      error: toFriendlyError(error, [
        { test: (_m, c) => c === "23505", friendly: (error.message.includes("voter_ip")
          ? "這個網路連線已經投過這一場了（同網路只能投一票，避免灌票）——如果你是跟朋友共用 wifi，可以試試切換成行動網路再投一次"
          : "你已經投過這一場了") },
        { test: (m) => m.includes("cannot vote on your own match"), friendly: "不能投自己參與的場次" },
        { test: (m) => m.includes("chosen registration is not part of this match"), friendly: "選擇的對象不在這場配對裡" },
      ]),
    };
  }

  revalidatePath("/vote");
  return { success: true };
}
