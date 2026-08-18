import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManageableCompetitions } from "@/lib/manageableCompetitions";
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
  if (!claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub as string;

  const { data: profile } = await supabase.from("profiles").select("host_setup_completed").eq("id", userId).maybeSingle();
  if (!profile?.host_setup_completed) redirect("/admin/profile");

  const myCompetitions = await getManageableCompetitions(supabase, "schedule");

  const selectedId = requestedId
    ? myCompetitions.find((c) => c.id === requestedId)?.id
    : myCompetitions[0]?.id;

  const competitionList = myCompetitions.map((c) => ({ id: c.id, name: c.name }));

  if (!selectedId) {
    return (
      <AdminShell active="schedule">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 時程設定</div>
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
      <AdminShell active="schedule">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 時程設定</div>
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
    />
  );
}
