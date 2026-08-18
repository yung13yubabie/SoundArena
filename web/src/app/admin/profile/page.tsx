import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/AdminShell";
import { ProfileForm } from "./ProfileForm";

export default async function AdminProfilePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, social_link, featured_track_url, host_setup_completed, is_platform_admin")
    .eq("id", userId)
    .maybeSingle();

  const { count: hostedCount } = await supabase
    .from("competitions")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", userId);

  return (
    <AdminShell active="profile" isPlatformAdmin={profile?.is_platform_admin ?? false}>
      <div className="mb-7">
        <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 主辦人身分</div>
        <h1 className="font-display text-[30px]">設定你的主持人檔案</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          這是你以主辦人身分公開露出的檔案，參賽者報名前會看到。第一次要先完成這裡才能進入賽制建立／時程設定／審核後台。
        </p>
      </div>

      <ProfileForm
        userId={userId}
        displayName={profile?.display_name ?? "（尚未設定名稱）"}
        hostedCount={hostedCount ?? 0}
        initial={{
          bio: profile?.bio ?? "",
          socialLink: profile?.social_link ?? "",
          featuredTrackUrl: profile?.featured_track_url ?? "",
        }}
        alreadySetup={profile?.host_setup_completed ?? false}
      />
    </AdminShell>
  );
}
