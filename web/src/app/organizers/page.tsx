import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";

interface PublicOrganizerRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  hosted_count: number;
}

export default async function OrganizersPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const authed = !!claims?.claims?.sub;

  const { data } = await supabase.rpc("list_public_organizers");
  const organizers = (data ?? []) as PublicOrganizerRow[];

  return (
    <div>
      <SiteHeader authed={authed} />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7">
          <h1 className="font-display text-[30px]">主辦人</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            這裡列出目前主辦過比賽的主辦人，點進去可以看到他們主辦的比賽與作品。
          </p>
        </div>

        {organizers.length === 0 ? (
          <EmptyState icon="users" title="還沒有主辦人建立過比賽" sub="等第一場比賽開放後就會出現在這裡" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {organizers.map((o) => (
              <Link key={o.id} href={`/u/${o.id}`} className="glass block p-4.5 transition-colors hover:border-accent/30">
                <div className="mb-3 h-11 w-11 rounded-full border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c]" />
                <div className="mb-1 text-[15px]">{o.display_name || "（未命名主辦方）"}</div>
                <div className="mb-2 text-[11.5px] text-ink-faint">主辦過 {o.hosted_count} 場比賽</div>
                {o.bio && <p className="line-clamp-2 text-[12px] text-ink-dim">{o.bio}</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
