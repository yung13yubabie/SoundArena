"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export interface CollaboratorPermissions {
  canReview: boolean;
  canEditFormat: boolean;
  canEditSchedule: boolean;
  canJudge: boolean;
  canInvite: boolean;
}

interface FoundProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export async function inviteCollaboratorByEmail(
  competitionId: string,
  email: string,
  permissions: CollaboratorPermissions,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const trimmed = email.trim();
  if (!trimmed) return { error: "請輸入 email" };

  const { data: foundRaw, error: lookupError } = await supabase
    .rpc("find_profile_by_email", { p_competition_id: competitionId, p_email: trimmed })
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };
  const found = foundRaw as unknown as FoundProfile | null;
  if (!found) return { error: "找不到用這個 email 註冊的帳號——對方需要先用這個 email 登入過 SoundArena 一次" };
  if (found.id === user.id) return { error: "不能邀請自己" };

  const { error } = await supabase.from("competition_collaborators").insert({
    competition_id: competitionId,
    user_id: found.id,
    can_review: permissions.canReview,
    can_edit_format: permissions.canEditFormat,
    can_edit_schedule: permissions.canEditSchedule,
    can_judge: permissions.canJudge,
    can_invite: permissions.canInvite,
    invited_by: user.id,
  });

  if (error) {
    if (error.code === "23505") return { error: "這個人已經是協作者了" };
    if (error.code === "42501") return { error: "你的權限不足——只能給出你自己也有的權限" };
    return { error: error.message };
  }

  revalidatePath("/admin/collaborators");
  return { success: true };
}

export async function updateCollaboratorPermissions(
  collaboratorId: string,
  permissions: CollaboratorPermissions,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("competition_collaborators")
    .update({
      can_review: permissions.canReview,
      can_edit_format: permissions.canEditFormat,
      can_edit_schedule: permissions.canEditSchedule,
      can_judge: permissions.canJudge,
      can_invite: permissions.canInvite,
    })
    .eq("id", collaboratorId);
  if (error) return { error: error.message };
  revalidatePath("/admin/collaborators");
  return { success: true };
}

export async function removeCollaborator(collaboratorId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("competition_collaborators").delete().eq("id", collaboratorId);
  if (error) return { error: error.message };
  revalidatePath("/admin/collaborators");
  return { success: true };
}
