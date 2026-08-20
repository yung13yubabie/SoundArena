"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export async function reviewSubmission(
  submissionId: string,
  status: "approved" | "rejected" | "pending_review",
  note?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { error } = await supabase.rpc("review_submission", {
    p_submission_id: submissionId,
    p_status: status,
    p_note: note?.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/review");
  revalidatePath("/status");
  return { success: true };
}

export async function reviewRegistration(
  registrationId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_registration", {
    p_registration_id: registrationId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/review");
  revalidatePath("/status");
  revalidatePath("/register");
  return { success: true };
}
