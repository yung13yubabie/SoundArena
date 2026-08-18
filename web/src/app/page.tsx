import { createClient } from "@/lib/supabase/server";
import { DiscoveryList, type Competition } from "./DiscoveryList";

export default async function HomePage() {
  const supabase = await createClient();
  const [{ data }, { data: claims }] = await Promise.all([
    supabase
      .from("competitions")
      .select("id, name, registration_closes_at, organizer_id, organizer:profiles(display_name)")
      .eq("is_public", true)
      .order("created_at", { ascending: false }),
    supabase.auth.getClaims(),
  ]);

  return <DiscoveryList competitions={(data as unknown as Competition[]) ?? []} authed={!!claims?.claims} />;
}
