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
    .select(
      "display_name, bio, social_link, featured_track_url, host_setup_completed, is_platform_admin, host_revoked_at, host_approved_at",
    )
    .eq("id", userId)
    .maybeSingle();

  const { count: hostedCount } = await supabase
    .from("competitions")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", userId);

  if (profile?.host_revoked_at) {
    return (
      <AdminShell active="profile" isPlatformAdmin={profile?.is_platform_admin ?? false}>
        <div className="mb-7">
          <h1 className="font-display text-[30px]">{profile.host_approved_at ? "你的主辦資格已被移除" : "你的主辦人申請已被駁回"}</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            {profile.host_approved_at
              ? "平台管理員撤除了你的主辦人管理權限，無法自行重新設定恢復。這不影響你以一般身份報名、投稿、投票其他比賽，也不會移除你已建立比賽的公開內容。如果認為這是誤判，請透過「意見回饋」頁聯繫平台管理員。"
              : "平台管理員審核後決定不核准這次的主辦人申請。如果認為這是誤判，請透過「意見回饋」頁聯繫平台管理員。"}
          </p>
        </div>
      </AdminShell>
    );
  }

  if (profile?.host_setup_completed && !profile?.host_approved_at) {
    return (
      <AdminShell active="profile" isPlatformAdmin={profile?.is_platform_admin ?? false}>
        <div className="mb-7">
          <h1 className="font-display text-[30px]">主辦人申請審核中</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            已收到你的主辦人申請，平台管理員審核通過後才能進入賽制建立／時程設定／審核後台。
          </p>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell active="profile" isPlatformAdmin={profile?.is_platform_admin ?? false}>
      <div className="mb-7">
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
