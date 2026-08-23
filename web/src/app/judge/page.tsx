import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManageableCompetitions } from "@/lib/manageableCompetitions";
import { redirectToLogin } from "@/lib/loginRedirect";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { JudgeBoard, type JudgeSubmission, type JudgeScoreItem } from "./JudgeBoard";

interface ScoreItemRow {
  id: string;
  label: string;
  kind: "weighted" | "bonus";
  weight_percent: number | null;
  score_item_templates: { key: string } | { key: string }[] | null;
}

interface ScoringRuleRow {
  id: string;
  round_id: string | null;
  score_items: ScoreItemRow[];
}

interface JudgeSubmissionRow {
  submission_id: string;
  title: string | null;
  registration_id: string;
  registration_status: string;
  process_doc: string | null;
  ethical_sourcing_declared: boolean;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function JudgePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; round?: string }>;
}) {
  const { c: requestedId, round: requestedRoundId } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) {
    const params = new URLSearchParams();
    if (requestedId) params.set("c", requestedId);
    if (requestedRoundId) params.set("round", requestedRoundId);
    const query = params.toString();
    redirectToLogin(query ? `/judge?${query}` : "/judge");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("host_setup_completed, is_platform_admin, host_revoked_at, host_approved_at")
    .eq("id", userId)
    .maybeSingle();
  const isPlatformAdmin = profile?.is_platform_admin ?? false;

  const myCompetitions = await getManageableCompetitions(supabase, "judge");

  // DB-03 資安複查發現:原本這道審核閘在查 myCompetitions 之前就擋掉了「自己
  // 沒申請當 Organizer,但被別人邀請當 judge 協作者」的合法使用者——「能不能
  // 建立自己的比賽」(host 審核)跟「能不能管理別人邀請我的比賽」(collaborator
  // 權限)是兩個獨立維度,不該共用同一道閘。只有真的一場都管不到時,才需要導去
  // /admin/profile 申請成為 Organizer。
  if (!isPlatformAdmin && myCompetitions.length === 0 && (!profile?.host_setup_completed || !profile?.host_approved_at || profile?.host_revoked_at)) {
    redirect("/admin/profile");
  }

  const competition = requestedId
    ? myCompetitions.find((c) => c.id === requestedId)
    : myCompetitions[0];

  const competitionList = myCompetitions.map((c) => ({ id: c.id, name: c.name }));

  if (!competition) {
    return (
      <AdminShell active="judge" isPlatformAdmin={isPlatformAdmin}>
        <div className="mb-7">
          <h1 className="font-display text-[30px]">還沒有比賽可以評分</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">先到「賽制建立」頁建立比賽。</p>
        </div>
      </AdminShell>
    );
  }

  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, round_index, name, voting_closes_at, results_finalized_at")
    .eq("competition_id", competition.id)
    .order("round_index");

  const round = requestedRoundId ? (rounds ?? []).find((r) => r.id === requestedRoundId) : (rounds ?? [])[0];

  const header = (
    <div className="mb-6">
      <h1 className="font-display text-[30px]">
        本輪待評分作品 — {competition.name}
      </h1>
      <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
        為了維持評分時不受作者身份影響,這個評分工作台一律顯示「匿名作品 #」,即使你是主辦本人也一樣——但主辦人/審核協作者在
        「審核投稿」頁本來就需要核對真實 Suno 帳號,這個承諾只涵蓋評分這個環節,不代表主辦人完全無法得知作者身份。加權項目的權重總和固定
        100%,額外加分項另外累加。
      </p>
      {(rounds ?? []).length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.75">
          {(rounds ?? []).map((r) => (
            <a
              key={r.id}
              href={`/judge?c=${competition.id}&round=${r.id}`}
              className={`rounded-full border px-3.25 py-1.5 text-[12px] ${
                round?.id === r.id
                  ? "border-accent/40 bg-accent/16 text-ink"
                  : "border-panel-border bg-white/[0.03] text-ink-dim hover:bg-white/[0.06] hover:text-ink"
              }`}
            >
              {r.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );

  if (!round) {
    return (
      <AdminShell
      active="judge"
      competitions={competitionList}
      activeCompetitionId={competition.id}
      isPlatformAdmin={isPlatformAdmin}
    >
        {header}
        <EmptyState icon="inbox" title="這場比賽還沒有任何輪次" sub="先到「賽制建立」頁新增輪次" />
      </AdminShell>
    );
  }

  // judge_submissions_for_round() 是匿名安全的 RPC(ADR-0020 SA-001):只回傳
  // 評分需要的欄位,不像直接查 registrations 那樣會把 user_id/display_name/
  // suno_handle 整列露出來給 judge 權限的協作者。
  const [{ data: scoringRuleRows }, { data: submissionRows }, { data: votes }] = await Promise.all([
    supabase
      .from("scoring_rules")
      .select("id, round_id, score_items(id, label, kind, weight_percent, score_item_templates(key))")
      .eq("competition_id", competition.id),
    supabase.rpc("judge_submissions_for_round", { p_round_id: round.id }),
    supabase.from("votes").select("submission_id, ai_usage_rating").eq("round_id", round.id),
  ]);

  const scoringRules = (scoringRuleRows ?? []) as unknown as ScoringRuleRow[];
  const scoringRule = scoringRules.find((sr) => sr.round_id === round.id) ?? scoringRules.find((sr) => sr.round_id === null);

  const scoreItems: JudgeScoreItem[] = (scoringRule?.score_items ?? []).map((si) => ({
    id: si.id,
    label: si.label,
    kind: si.kind,
    weightPercent: si.weight_percent,
    templateKey: one(si.score_item_templates)?.key ?? null,
  }));

  if (!scoringRule || scoreItems.length === 0) {
    return (
      <AdminShell
      active="judge"
      competitions={competitionList}
      activeCompetitionId={competition.id}
      isPlatformAdmin={isPlatformAdmin}
    >
        {header}
        <EmptyState icon="inbox" title="這一輪還沒有設定計分項目" sub="先到「賽制建立」頁設定 Competition 預設或本輪的 ScoringRule" />
      </AdminShell>
    );
  }

  const voteCounts = new Map<string, number>();
  const ratingSums = new Map<string, { sum: number; count: number }>();
  for (const v of votes ?? []) {
    voteCounts.set(v.submission_id, (voteCounts.get(v.submission_id) ?? 0) + 1);
    if (v.ai_usage_rating !== null) {
      const acc = ratingSums.get(v.submission_id) ?? { sum: 0, count: 0 };
      acc.sum += v.ai_usage_rating;
      acc.count += 1;
      ratingSums.set(v.submission_id, acc);
    }
  }
  const avgRating = (submissionId: string) => {
    const acc = ratingSums.get(submissionId);
    return acc && acc.count > 0 ? acc.sum / acc.count : 0;
  };

  const submissionsRaw = (submissionRows ?? []) as unknown as JudgeSubmissionRow[];
  const submissionIds = submissionsRaw.map((s) => s.submission_id);

  const { data: scoreRows } = submissionIds.length
    ? await supabase.from("submission_scores").select("submission_id, score_item_id, raw_value").in("submission_id", submissionIds)
    : { data: [] };

  const scoreByKey = new Map((scoreRows ?? []).map((s) => [`${s.submission_id}:${s.score_item_id}`, s.raw_value]));

  const submissions: JudgeSubmission[] = submissionsRaw.map((s, idx) => {
    const values: Record<string, number> = {};
    for (const item of scoreItems) {
      if (item.templateKey === "vote") {
        values[item.id] = voteCounts.get(s.submission_id) ?? 0;
      } else if (item.templateKey === "audience_ai_usage_rating") {
        values[item.id] = avgRating(s.submission_id);
      } else {
        values[item.id] = scoreByKey.get(`${s.submission_id}:${item.id}`) ?? 0;
      }
    }
    return {
      id: s.submission_id,
      label: `匿名作品 #${String(idx + 1).padStart(2, "0")}`,
      registrationId: s.registration_id,
      eliminated: s.registration_status === "eliminated",
      values,
      processDoc: s.process_doc,
      ethicalSourcingDeclared: s.ethical_sourcing_declared,
    };
  });

  return (
    <AdminShell
      active="judge"
      competitions={competitionList}
      activeCompetitionId={competition.id}
      isPlatformAdmin={isPlatformAdmin}
    >
      {header}
      {submissions.length === 0 ? (
        <EmptyState icon="inbox" title="目前沒有待評分作品" sub="等待本輪投稿審核完成後,待評分清單才會出現作品" />
      ) : (
        <JudgeBoard
          roundId={round.id}
          scoreItems={scoreItems}
          submissions={submissions}
          votingClosesAt={round.voting_closes_at}
          resultsFinalizedAt={round.results_finalized_at}
        />
      )}
    </AdminShell>
  );
}
