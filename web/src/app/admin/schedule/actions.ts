"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyError } from "@/lib/actionError";

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

  const { error: competitionError } = await supabase.rpc("save_competition_schedule", {
    p_competition_id: input.competitionId,
    p_promotion_starts_at: orNull(input.promotionStart),
    p_promotion_ends_at: orNull(input.promotionEnd),
    p_announcement_starts_at: orNull(input.announcementStart),
    p_announcement_ends_at: orNull(input.announcementEnd),
    p_registration_closes_at: orNull(input.registrationDeadline),
  });
  if (competitionError) return { error: toFriendlyError(competitionError) };

  // Applied uniformly to every round for now — the schedule screen doesn't yet
  // support per-round submission/voting windows (see SPEC.md 第2節 "僅開放特定
  // 輪次投稿", which is a real, separate feature this doesn't build).
  const { error: roundsError } = await supabase.rpc("set_round_schedule_windows", {
    p_competition_id: input.competitionId,
    p_round_ids: input.roundIds,
    p_submission_opens_at: orNull(input.submissionStart),
    p_submission_closes_at: orNull(input.submissionEnd),
    p_voting_opens_at: orNull(input.votingStart),
    p_voting_closes_at: orNull(input.votingEnd),
  });
  if (roundsError) return { error: toFriendlyError(roundsError) };

  revalidatePath("/admin/schedule");
  return { success: true };
}
