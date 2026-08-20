"use server";

import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";

type ActionResult = { success: true } | { error: string };

const MAX_COMMENT_LENGTH = 2000;

export interface CommentRow {
  id: string;
  body: string;
  commenterDisplayName: string | null;
  isOwnComment: boolean;
  endorsementPercent: number;
  endorsedAt: string | null;
  createdAt: string;
}

interface RawCommentRow {
  comment_id: string;
  body: string;
  commenter_display_name: string | null;
  is_own_comment: boolean | null;
  endorsement_percent: number;
  endorsed_at: string | null;
  created_at: string;
}

export async function fetchSubmissionComments(submissionId: string): Promise<CommentRow[] | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_submission_comments", { p_submission_id: submissionId });
  if (error) return { error: toFriendlyError(error) };

  return ((data ?? []) as unknown as RawCommentRow[]).map((r) => ({
    id: r.comment_id,
    body: r.body,
    commenterDisplayName: r.commenter_display_name,
    isOwnComment: r.is_own_comment ?? false,
    endorsementPercent: Number(r.endorsement_percent),
    endorsedAt: r.endorsed_at,
    createdAt: r.created_at,
  }));
}

export async function submitComment(submissionId: string, body: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const trimmed = body.trim();
  if (!trimmed) return { error: "留言不能是空的" };
  if (trimmed.length > MAX_COMMENT_LENGTH) return { error: `留言最長 ${MAX_COMMENT_LENGTH} 字` };

  // 不能用預設 .select() 帶回結果——commenter_id 誰都不給讀,PostgREST 的
  // Prefer: return=representation 會連那個欄位一起要,直接 403(見 HANDOFF 踩坑記錄)。
  const { error } = await supabase.from("comments").insert({
    submission_id: submissionId,
    commenter_id: user.id,
    body: trimmed,
  });

  if (error) {
    return {
      error: toFriendlyError(error, [
        { test: (m) => m.includes("cannot comment on your own submission"), friendly: "不能留言給自己的作品" },
        { test: (m) => m.includes("wait a moment before commenting again"), friendly: "留言太頻繁，請稍等一下再送" },
      ]),
    };
  }

  return { success: true };
}

export async function endorseComment(commentId: string, percent: number): Promise<ActionResult> {
  const supabase = await createClient();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  const { error } = await supabase
    .from("comments")
    .update({ endorsement_percent: clamped, endorsed_at: new Date().toISOString() })
    .eq("id", commentId);

  if (error) return { error: toFriendlyError(error) };
  return { success: true };
}
