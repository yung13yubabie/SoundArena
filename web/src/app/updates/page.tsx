import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";

export default async function UpdatesPage() {
  const supabase = await createClient();
  const [{ data: entries }, { data: claims }] = await Promise.all([
    supabase.from("changelog_entries").select("id, title, description, published_at").order("published_at", { ascending: false }),
    supabase.auth.getClaims(),
  ]);

  return (
    <div>
      <SiteHeader authed={!!claims?.claims} />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">更新記錄</div>
          <h1 className="font-display text-[30px]">SoundArena 更新記錄</h1>
        </div>

        {!entries || entries.length === 0 ? (
          <EmptyState icon="calendar" title="還沒有更新記錄" sub="平台上線新功能後會出現在這裡" />
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map((entry) => (
              <div key={entry.id} className="glass p-5">
                <div className="mb-1.5 text-[12px] text-ink-faint">{entry.published_at}</div>
                <div className="mb-1.5 text-[15.5px] font-semibold">{entry.title}</div>
                <div className="text-[13px] leading-relaxed text-ink-dim">{entry.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
