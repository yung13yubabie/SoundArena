import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManageableCompetitions } from "@/lib/manageableCompetitions";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { ReviewQueue, type ReviewRow } from "./ReviewQueue";

interface SubmissionRow {
  id: string;
  title: string | null;
  sharer_handle: string | null;
  status: string;
  review_note: string | null;
  registrations: { display_name: string; suno_handle: string } | { display_name: string; suno_handle: string }[] | null;
}

function oneRegistration(value: SubmissionRow["registrations"]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: requestedId } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("host_setup_completed").eq("id", userId).maybeSingle();
  if (!profile?.host_setup_completed) redirect("/admin/profile");

  const myCompetitions = await getManageableCompetitions(supabase, "review");

  const competition = requestedId
    ? myCompetitions.find((c) => c.id === requestedId)
    : myCompetitions[0];

  const competitionList = myCompetitions.map((c) => ({ id: c.id, name: c.name }));

  if (!competition) {
    return (
      <AdminShell active="review">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 審核後台</div>
          <h1 className="font-display text-[30px]">還沒有比賽可以審核</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            先到「賽制建立」頁建立比賽，投稿送進來後才會出現在這裡。
          </p>
        </div>
      </AdminShell>
    );
  }

  const { data: rounds } = await supabase.from("rounds").select("id").eq("competition_id", competition.id);
  const roundIds = (rounds ?? []).map((r) => r.id);

  const { data: submissions } = roundIds.length
    ? await supabase
        .from("submissions")
        .select("id, title, sharer_handle, status, review_note, registrations(display_name, suno_handle)")
        .in("round_id", roundIds)
        .in("status", ["pending_review", "identity_mismatched", "approved", "rejected"])
        .order("created_at", { ascending: false })
    : { data: [] };

  const rows: ReviewRow[] = ((submissions ?? []) as unknown as SubmissionRow[]).map((s) => {
    const reg = oneRegistration(s.registrations);
    return {
      id: s.id,
      title: s.title ?? "未命名作品",
      nickname: reg?.display_name ?? "未知參賽者",
      handle: s.sharer_handle ?? "unknown",
      identityMatch: s.sharer_handle && reg?.suno_handle && s.sharer_handle === reg.suno_handle ? "match" : "mismatch",
      status: s.status as ReviewRow["status"],
      reviewNote: s.review_note,
    };
  });

  return (
    <AdminShell active="review" competitions={competitionList} activeCompetitionId={competition.id}>
      <div className="mb-7">
        <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 審核後台</div>
        <h1 className="font-display text-[30px]">投稿審核清單 — {competition.name}</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          身份比對由系統自動判定，不公開設定需要你打開作者主頁人工核對。比對不通過時可以人工放行。
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="inbox" title="目前沒有待審核的投稿" sub="投稿者送出投稿並通過身份比對後，會出現在這個清單" />
      ) : (
        <ReviewQueue rows={rows} />
      )}
    </AdminShell>
  );
}
