"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export interface SubmitEntryInput {
  roundId: string;
  registrationId: string;
  sunoShareUrl: string;
  title: string;
  coverImageUrl: string | null;
  sharerHandle: string;
  lyrics: string;
  allowPublicPlayback: boolean;
}

export async function submitEntry(input: SubmitEntryInput): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("submissions").insert({
    round_id: input.roundId,
    registration_id: input.registrationId,
    suno_share_url: input.sunoShareUrl,
    title: input.title,
    cover_image_url: input.coverImageUrl,
    sharer_handle: input.sharerHandle,
    lyrics: input.lyrics,
    allow_public_playback: input.allowPublicPlayback,
    // Identity check already ran (mock) client-side before this action is
    // called — real Suno API integration is a separate, larger task (see
    // HANDOFF.md). Landing straight in pending_review reflects a passed check.
    status: "pending_review",
  });

  if (error) {
    if (error.code === "23505") return { error: "這個輪次你已經投稿過了" };
    return { error: error.message };
  }

  revalidatePath("/submit");
  revalidatePath("/status");
  return { success: true };
}
