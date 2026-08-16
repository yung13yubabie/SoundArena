"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export async function setRegistrationPublic(registrationId: string, isPublic: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_registration_public", {
    p_registration_id: registrationId,
    p_is_public: isPublic,
  });
  if (error) return { error: error.message };
  revalidatePath("/status");
  return { success: true };
}

export async function setSubmissionPublic(submissionId: string, isPublic: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_submission_public", {
    p_submission_id: submissionId,
    p_is_public: isPublic,
  });
  if (error) return { error: error.message };
  revalidatePath("/status");
  return { success: true };
}

export async function setAllPublic(
  registrationIds: string[],
  submissionIds: string[],
  isPublic: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  for (const id of registrationIds) {
    const { error } = await supabase.rpc("set_registration_public", { p_registration_id: id, p_is_public: isPublic });
    if (error) return { error: error.message };
  }
  for (const id of submissionIds) {
    const { error } = await supabase.rpc("set_submission_public", { p_submission_id: id, p_is_public: isPublic });
    if (error) return { error: error.message };
  }
  revalidatePath("/status");
  return { success: true };
}
