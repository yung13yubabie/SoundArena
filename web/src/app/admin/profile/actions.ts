"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export interface OrganizerProfileInput {
  bio: string;
  socialLink: string;
  featuredTrackUrl: string;
}

export async function saveOrganizerProfile(input: OrganizerProfileInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { error } = await supabase
    .from("profiles")
    .update({
      bio: input.bio.trim() || null,
      social_link: input.socialLink.trim() || null,
      featured_track_url: input.featuredTrackUrl.trim() || null,
      host_setup_completed: true,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/admin/profile");
  revalidatePath("/admin/format");
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/review");
  revalidatePath(`/u/${user.id}`);
  return { success: true };
}
