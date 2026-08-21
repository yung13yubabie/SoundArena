"use server";

import { createClient } from "@/lib/supabase/server";
import { getPlaybackUrl } from "@/lib/storage";

export type PlaybackUrlResult = { url: string } | { url: null } | { error: string };

// 用一般(受 RLS 限制)的 client 查 audio_object_key——查不查得到這個欄位本身
// 就是權限判斷:能看到這筆 submission 的人(自己的投稿、比賽方、或公開試聽條件
// 成立的作品)才拿得到 key,B2 的簽章網址只在這裡短暫產生,不會被快取成長效連結。
export async function getSubmissionPlaybackUrl(submissionId: string): Promise<PlaybackUrlResult> {
  const supabase = await createClient();
  const { data: submission, error } = await supabase
    .from("submissions")
    .select("audio_object_key")
    .eq("id", submissionId)
    .maybeSingle();

  if (error) return { error: "無法讀取這首作品" };
  if (!submission || !submission.audio_object_key) return { url: null };

  const url = await getPlaybackUrl(submission.audio_object_key);
  return { url };
}
