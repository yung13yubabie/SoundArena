"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";

type ActionResult = { success: true } | { error: string };

export async function updateDisplayName(name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "暱稱不能是空的" };
  if (trimmed.length > 40) return { error: "暱稱最長 40 個字" };

  const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", user.id);
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/status");
  revalidatePath(`/u/${user.id}`);
  return { success: true };
}

export async function setRegistrationPublic(registrationId: string, isPublic: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_registration_public", {
    p_registration_id: registrationId,
    p_is_public: isPublic,
  });
  if (error) return { error: toFriendlyError(error) };
  revalidatePath("/status");
  return { success: true };
}

export async function setSubmissionPublic(submissionId: string, isPublic: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_submission_public", {
    p_submission_id: submissionId,
    p_is_public: isPublic,
  });
  if (error) return { error: toFriendlyError(error) };
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
    if (error) return { error: toFriendlyError(error) };
  }
  for (const id of submissionIds) {
    const { error } = await supabase.rpc("set_submission_public", { p_submission_id: id, p_is_public: isPublic });
    if (error) return { error: toFriendlyError(error) };
  }
  revalidatePath("/status");
  return { success: true };
}
