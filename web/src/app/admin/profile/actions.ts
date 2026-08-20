"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";

type ActionResult = { success: true } | { error: string };

export interface OrganizerProfileInput {
  bio: string;
  socialLink: string;
  featuredTrackUrl: string;
}

const MAX_BIO_LENGTH = 800;
const MAX_URL_LENGTH = 2048;

export async function saveOrganizerProfile(input: OrganizerProfileInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const bio = input.bio.trim();
  const socialLink = input.socialLink.trim();
  const featuredTrackUrl = input.featuredTrackUrl.trim();
  if (bio.length > MAX_BIO_LENGTH) return { error: `簡介最長 ${MAX_BIO_LENGTH} 字` };
  if (socialLink.length > MAX_URL_LENGTH) return { error: "社群連結網址太長" };
  if (featuredTrackUrl.length > MAX_URL_LENGTH) return { error: "精選作品網址太長" };

  const { error } = await supabase
    .from("profiles")
    .update({
      bio: bio || null,
      social_link: socialLink || null,
      featured_track_url: featuredTrackUrl || null,
      host_setup_completed: true,
    })
    .eq("id", user.id);

  if (error) return { error: toFriendlyError(error) };

  revalidatePath("/admin/profile");
  revalidatePath("/admin/format");
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/review");
  revalidatePath(`/u/${user.id}`);
  return { success: true };
}
