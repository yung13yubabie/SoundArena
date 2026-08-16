import { createClient } from "@/lib/supabase/server";
import { DiscoveryList, type Competition } from "./DiscoveryList";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("id, name, registration_closes_at, organizer:profiles(display_name)")
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  return <DiscoveryList competitions={(data as unknown as Competition[]) ?? []} />;
}
