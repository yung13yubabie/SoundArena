"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export async function submitReport(competitionId: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const trimmed = reason.trim();
  if (!trimmed) return { error: "請描述具體情況" };

  const { error } = await supabase.from("reports").insert({
    competition_id: competitionId,
    reporter_id: user.id,
    reason: trimmed,
  });

  if (error) return { error: error.message };
  return { success: true };
}
