import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManageableCompetitions } from "@/lib/manageableCompetitions";
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

interface SubmissionRow {
  id: string;
  title: string | null;
  registration_id: string;
  registrations: { id: string; status: string } | { id: string; status: string }[] | null;
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
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("host_setup_completed, is_platform_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.host_setup_completed) redirect("/admin/profile");
  const isPlatformAdmin = profile.is_platform_admin ?? false;

  const myCompetitions = await getManageableCompetitions(supabase, "judge");

  const competition = requestedId
    ? myCompetitions.find((c) => c.id === requestedId)
    : myCompetitions[0];

  const competitionList = myCompetitions.map((c) => ({ id: c.id, name: c.name }));

  if (!competition) {
    return (
      <AdminShell active="judge" isPlatformAdmin={isPlatformAdmin}>
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 評審評分</div>
          <h1 className="font-display text-[30px]">還沒有比賽可以評分</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">先到「賽制建立」頁建立比賽。</p>
        </div>
      </AdminShell>
    );
  }

  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, round_index, name")
    .eq("competition_id", competition.id)
    .order("round_index");

  const round = requestedRoundId ? (rounds ?? []).find((r) => r.id === requestedRoundId) : (rounds ?? [])[0];

  const header = (
    <div className="mb-6">
      <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 評審評分</div>
      <h1 className="font-display text-[30px]">
        本輪待評分作品 — {competition.name}
      </h1>
      <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
        為了維持評分時不受作者身份影響,這裡一律顯示「匿名作品 #」,即使你是主辦本人。加權項目的權重總和固定
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

  const [{ data: scoringRuleRows }, { data: submissionRows }, { data: votes }] = await Promise.all([
    supabase
      .from("scoring_rules")
      .select("id, round_id, score_items(id, label, kind, weight_percent, score_item_templates(key))")
      .eq("competition_id", competition.id),
    supabase
      .from("submissions")
      .select("id, title, registration_id, registrations(id, status)")
      .eq("round_id", round.id)
      .eq("status", "approved"),
    supabase.from("votes").select("submission_id").eq("round_id", round.id),
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
  for (const v of votes ?? []) {
    voteCounts.set(v.submission_id, (voteCounts.get(v.submission_id) ?? 0) + 1);
  }

  const submissionsRaw = (submissionRows ?? []) as unknown as SubmissionRow[];
  const submissionIds = submissionsRaw.map((s) => s.id);

  const { data: scoreRows } = submissionIds.length
    ? await supabase.from("submission_scores").select("submission_id, score_item_id, raw_value").in("submission_id", submissionIds)
    : { data: [] };

  const scoreByKey = new Map((scoreRows ?? []).map((s) => [`${s.submission_id}:${s.score_item_id}`, s.raw_value]));

  const submissions: JudgeSubmission[] = submissionsRaw.map((s, idx) => {
    const reg = one(s.registrations);
    const values: Record<string, number> = {};
    for (const item of scoreItems) {
      values[item.id] = item.templateKey === "vote" ? (voteCounts.get(s.id) ?? 0) : (scoreByKey.get(`${s.id}:${item.id}`) ?? 0);
    }
    return {
      id: s.id,
      label: `匿名作品 #${String(idx + 1).padStart(2, "0")}`,
      registrationId: reg?.id ?? s.registration_id,
      eliminated: reg?.status === "eliminated",
      values,
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
        <JudgeBoard roundId={round.id} scoreItems={scoreItems} submissions={submissions} />
      )}
    </AdminShell>
  );
}
