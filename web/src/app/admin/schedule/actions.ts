"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

export interface ScheduleInput {
  competitionId: string;
  roundIds: string[];
  promotionStart: string;
  promotionEnd: string;
  submissionStart: string;
  submissionEnd: string;
  votingStart: string;
  votingEnd: string;
  announcementStart: string;
  announcementEnd: string;
  registrationDeadline: string;
}

// <input type="date"> sends "" when empty — Postgres rejects "" for timestamptz
// (it's not the same as NULL), so every empty field needs converting first.
function orNull(value: string): string | null {
  return value === "" ? null : value;
}

export async function saveSchedule(input: ScheduleInput): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: competitionError } = await supabase
    .from("competitions")
    .update({
      promotion_starts_at: orNull(input.promotionStart),
      promotion_ends_at: orNull(input.promotionEnd),
      announcement_starts_at: orNull(input.announcementStart),
      announcement_ends_at: orNull(input.announcementEnd),
      registration_closes_at: orNull(input.registrationDeadline),
    })
    .eq("id", input.competitionId);
  if (competitionError) return { error: competitionError.message };

  // Applied uniformly to every round for now — the schedule screen doesn't yet
  // support per-round submission/voting windows (see SPEC.md 第2節 "僅開放特定
  // 輪次投稿", which is a real, separate feature this doesn't build).
  const { error: roundsError } = await supabase
    .from("rounds")
    .update({
      submission_opens_at: orNull(input.submissionStart),
      submission_closes_at: orNull(input.submissionEnd),
      voting_opens_at: orNull(input.votingStart),
      voting_closes_at: orNull(input.votingEnd),
    })
    .in("id", input.roundIds);
  if (roundsError) return { error: roundsError.message };

  revalidatePath("/admin/schedule");
  return { success: true };
}
