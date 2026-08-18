import { createClient } from "@/lib/supabase/server";

export interface ManageableCompetition {
  id: string;
  name: string;
  is_organizer: boolean;
}

export async function getManageableCompetitions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  permission: "review" | "format" | "schedule" | "judge" | "invite",
): Promise<ManageableCompetition[]> {
  const { data } = await supabase.rpc("get_manageable_competitions", { p_permission: permission });
  return (data ?? []) as unknown as ManageableCompetition[];
}
