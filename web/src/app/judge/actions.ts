"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";

type ActionResult = { success: true } | { error: string };

// SA-007 修復:改走 save_submission_score() RPC,不再直接 upsert submission_scores——
// RPC 內部會驗證 scoreItemId 真的屬於這個 submission 適用的 scoring_rule,不像舊版
// 只靠 RLS 檢查「你能不能評這個 submission 所屬的比賽」,擋不住塞別的 scoring_rule
// 底下的 score_item_id 進來污染資料。
export async function saveScore(submissionId: string, scoreItemId: string, rawValue: number): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { error } = await supabase.rpc("save_submission_score", {
    p_submission_id: submissionId,
    p_score_item_id: scoreItemId,
    p_raw_value: rawValue,
  });
  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/judge");
  return { success: true };
}

export async function setEliminated(
  registrationId: string,
  roundId: string,
  eliminated: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_registration_eliminated", {
    p_registration_id: registrationId,
    p_round_id: roundId,
    p_eliminated: eliminated,
  });
  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/judge");
  revalidatePath("/status");
  return { success: true };
}
