import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/AdminShell";
import { ScheduleForm } from "./ScheduleForm";

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export default async function AdminSchedulePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub as string;

  const { data: competition } = await supabase
    .from("competitions")
    .select(
      "id, name, registration_closes_at, promotion_starts_at, promotion_ends_at, announcement_starts_at, announcement_ends_at",
    )
    .eq("organizer_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
    />
  );
}
