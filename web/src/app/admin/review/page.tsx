import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManageableCompetitions } from "@/lib/manageableCompetitions";
import { redirectToLogin } from "@/lib/loginRedirect";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { ReviewQueue, type ReviewRow } from "./ReviewQueue";
import { RegistrationReviewQueue, type PendingRegistration } from "./RegistrationReviewQueue";
import { ParticipantRoster, type ParticipantRow } from "./ParticipantRoster";

interface RegistrationRow {
  id: string;
  display_name: string;
  suno_handle: string;
}

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
  if (!userId) redirectToLogin(requestedId ? `/admin/review?c=${encodeURIComponent(requestedId)}` : "/admin/review");

  const { data: profile } = await supabase
    .from("profiles")
    .select("host_setup_completed, is_platform_admin, host_revoked_at, host_approved_at")
    .eq("id", userId)
    .maybeSingle();
  const isPlatformAdmin = profile?.is_platform_admin ?? false;

  const myCompetitions = await getManageableCompetitions(supabase, "review");

  // DB-03 資安複查:見 judge/page.tsx 同一處註解——host 審核跟 collaborator
  // 權限是兩個獨立維度,只有真的一場都管不到才導去 /admin/profile。
  if (!isPlatformAdmin && myCompetitions.length === 0 && (!profile?.host_setup_completed || !profile?.host_approved_at || profile?.host_revoked_at)) {
    redirect("/admin/profile");
  }

  const competition = requestedId
    ? myCompetitions.find((c) => c.id === requestedId)
    : myCompetitions[0];

  const competitionList = myCompetitions.map((c) => ({ id: c.id, name: c.name }));

  if (!competition) {
    return (
      <AdminShell active="review" isPlatformAdmin={isPlatformAdmin}>
        <div className="mb-7">
          <h1 className="font-display text-[30px]">還沒有比賽可以審核</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            先到「賽制建立」頁建立比賽，投稿送進來後才會出現在這裡。
          </p>
        </div>
      </AdminShell>
    );
  }

  const { data: pendingRegistrations } = await supabase
    .from("registrations")
    .select("id, display_name, suno_handle")
    .eq("competition_id", competition.id)
    .eq("review_status", "pending_review")
    .order("created_at", { ascending: false });

  const pendingRegRows: PendingRegistration[] = ((pendingRegistrations ?? []) as unknown as RegistrationRow[]).map(
    (r) => ({ id: r.id, displayName: r.display_name, sunoHandle: r.suno_handle }),
  );

  const { data: rounds } = await supabase.from("rounds").select("id").eq("competition_id", competition.id);
  const roundIds = (rounds ?? []).map((r) => r.id);

  // SA-012 追加需求:主辦人要能看到「已投稿/未投稿」名單並直接傳訊息——approved
  // 的報名者才算真正的參賽者(pending_review 的已經在上面那個審核清單處理)。
  const { data: approvedRegistrations } = await supabase
    .from("registrations")
    .select("id, display_name, suno_handle")
    .eq("competition_id", competition.id)
    .eq("review_status", "approved")
    .order("display_name");

  const { data: allSubmissions } = roundIds.length
    ? await supabase.from("submissions").select("registration_id, round_id").in("round_id", roundIds)
    : { data: [] };

  const submittedRoundsByRegistration = new Map<string, Set<string>>();
  for (const s of allSubmissions ?? []) {
    const set = submittedRoundsByRegistration.get(s.registration_id) ?? new Set<string>();
    set.add(s.round_id);
    submittedRoundsByRegistration.set(s.registration_id, set);
  }

  const participantRows: ParticipantRow[] = ((approvedRegistrations ?? []) as unknown as RegistrationRow[]).map((r) => ({
    registrationId: r.id,
    displayName: r.display_name,
    sunoHandle: r.suno_handle,
    submittedRounds: submittedRoundsByRegistration.get(r.id)?.size ?? 0,
    totalRounds: roundIds.length,
  }));

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
    <AdminShell
      active="review"
      competitions={competitionList}
      activeCompetitionId={competition.id}
      isPlatformAdmin={isPlatformAdmin}
    >
      <div className="mb-7">
        <h1 className="font-display text-[30px]">審核後台 — {competition.name}</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          報名審核用來防範惡意/灌水報名；投稿審核的身份比對由系統自動判定，比對不通過時可以人工放行。
        </p>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-[15px] font-semibold">報名審核</h2>
        {pendingRegRows.length === 0 ? (
          <EmptyState icon="inbox" title="目前沒有待審核的報名" sub="有人報名這場比賽後，會出現在這個清單" />
        ) : (
          <RegistrationReviewQueue rows={pendingRegRows} />
        )}
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-[15px] font-semibold">投稿審核</h2>
        {rows.length === 0 ? (
          <EmptyState icon="inbox" title="目前沒有待審核的投稿" sub="投稿者送出投稿並通過身份比對後，會出現在這個清單" />
        ) : (
          <ReviewQueue rows={rows} />
        )}
      </div>

      <div>
        <h2 className="mb-3 text-[15px] font-semibold">參賽者名單</h2>
        <p className="mb-3 max-w-[680px] text-[12px] leading-relaxed text-ink-dim">
          已核准報名的參賽者，可以看到每個人的投稿進度，也能直接傳訊息給對方（透過對方登入時用的 Discord／Email）。
        </p>
        {participantRows.length === 0 ? (
          <EmptyState icon="users" title="目前還沒有核准通過的參賽者" sub="報名審核通過後，會出現在這個清單" />
        ) : (
          <ParticipantRoster rows={participantRows} />
        )}
      </div>
    </AdminShell>
  );
}
