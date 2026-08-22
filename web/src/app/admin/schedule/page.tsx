import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManageableCompetitions } from "@/lib/manageableCompetitions";
import { redirectToLogin } from "@/lib/loginRedirect";
import { AdminShell } from "@/components/AdminShell";
import { ScheduleForm } from "./ScheduleForm";

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: requestedId } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirectToLogin(requestedId ? `/admin/schedule?c=${encodeURIComponent(requestedId)}` : "/admin/schedule");
  const userId = claims.claims.sub as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("host_setup_completed, is_platform_admin, host_revoked_at, host_approved_at")
    .eq("id", userId)
    .maybeSingle();
  // Platform admin 一律放行——不然他們自己的主辦資格一旦處於待審核，就沒有任何人
  // 能進到這個 shell 去核准任何人的申請（含自己），會變成死鎖。
  const isPlatformAdmin = profile?.is_platform_admin ?? false;

  const myCompetitions = await getManageableCompetitions(supabase, "schedule");

  // DB-03 資安複查:見 judge/page.tsx 同一處註解——host 審核跟 collaborator
  // 權限是兩個獨立維度,只有真的一場都管不到才導去 /admin/profile。
  if (!isPlatformAdmin && myCompetitions.length === 0 && (!profile?.host_setup_completed || !profile?.host_approved_at || profile?.host_revoked_at)) {
    redirect("/admin/profile");
  }

  const selectedId = requestedId
    ? myCompetitions.find((c) => c.id === requestedId)?.id
    : myCompetitions[0]?.id;

  const competitionList = myCompetitions.map((c) => ({ id: c.id, name: c.name }));

  if (!selectedId) {
    return (
      <AdminShell active="schedule" isPlatformAdmin={isPlatformAdmin}>
        <div className="mb-7">
          <h1 className="font-display text-[30px]">還沒有比賽可以設定時程</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            先到「賽制建立」頁建立比賽，才能回來設定時程。
          </p>
        </div>
      </AdminShell>
    );
  }

  const { data: competition } = await supabase
    .from("competitions")
    .select(
      "id, name, registration_closes_at, promotion_starts_at, promotion_ends_at, announcement_starts_at, announcement_ends_at",
    )
    .eq("id", selectedId)
    .single();

  if (!competition) {
    return (
      <AdminShell active="schedule" isPlatformAdmin={isPlatformAdmin}>
        <div className="mb-7">
          <h1 className="font-display text-[30px]">還沒有比賽可以設定時程</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            先到「賽制建立」頁建立比賽，才能回來設定時程。
          </p>
        </div>
      </AdminShell>
    );
  }

  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, round_index, submission_opens_at, submission_closes_at, voting_opens_at, voting_closes_at")
    .eq("competition_id", competition.id)
    .order("round_index");

  const representative = (rounds ?? [])[0];

  return (
    <ScheduleForm
      competitionId={competition.id}
      competitionName={competition.name}
      roundIds={(rounds ?? []).map((r) => r.id)}
      initial={{
        promotionStart: toDateInput(competition.promotion_starts_at),
        promotionEnd: toDateInput(competition.promotion_ends_at),
        submissionStart: toDateInput(representative?.submission_opens_at ?? null),
        submissionEnd: toDateInput(representative?.submission_closes_at ?? null),
        votingStart: toDateInput(representative?.voting_opens_at ?? null),
        votingEnd: toDateInput(representative?.voting_closes_at ?? null),
        announcementStart: toDateInput(competition.announcement_starts_at),
        announcementEnd: toDateInput(competition.announcement_ends_at),
        registrationDeadline: toDateInput(competition.registration_closes_at),
      }}
      competitionList={competitionList}
      isPlatformAdmin={isPlatformAdmin}
    />
  );
}
