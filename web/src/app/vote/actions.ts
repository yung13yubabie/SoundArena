"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("votes").insert({
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
