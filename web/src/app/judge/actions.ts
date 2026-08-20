"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export async function saveScore(submissionId: string, scoreItemId: string, rawValue: number): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { error } = await supabase
    .from("submission_scores")
    .upsert(
      { submission_id: submissionId, score_item_id: scoreItemId, raw_value: rawValue, entered_by: user.id },
      { onConflict: "submission_id,score_item_id" },
    );
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

  revalidatePath("/judge");
  revalidatePath("/status");
  return { success: true };
}
