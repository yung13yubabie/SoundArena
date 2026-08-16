import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/lib/icons";
import { SUBMISSION_STATE_META, STATE_PILL_CLASS, type SubmissionState } from "@/lib/mockData";

interface RegistrationRow {
  id: string;
  status: "active" | "eliminated";
  eliminated_in_round_id: string | null;
  competition_id: string;
  competitions: { name: string } | { name: string }[] | null;
}

interface RoundRow {
  id: string;
  name: string;
  round_index: number;
  competition_id: string;
  allows_new_submissions: boolean;
}

function oneName(value: { name: string } | { name: string }[] | null): string {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? "未命名比賽";
}

export default async function StatusPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { data: registrations } = await supabase
    .from("registrations")
    .select("id, status, eliminated_in_round_id, competition_id, competitions(name)")
    .eq("user_id", userId);

  const regs = (registrations ?? []) as unknown as RegistrationRow[];
  const competitionIds = regs.map((r) => r.competition_id);

  const { data: rounds } = competitionIds.length
    ? await supabase
        .from("rounds")
        .select("id, name, round_index, competition_id, allows_new_submissions")
        .in("competition_id", competitionIds)
        .order("round_index")
    : { data: [] as RoundRow[] };

  const { data: submissions } = regs.length
    ? await supabase
        .from("submissions")
        .select("round_id, registration_id, status")
        .in(
          "registration_id",
          regs.map((r) => r.id),
        )
    : { data: [] };

  const submissionByKey = new Map((submissions ?? []).map((s) => [`${s.round_id}:${s.registration_id}`, s.status as SubmissionState]));

  return (
    <div>
      <SiteHeader authed active="status" />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 個人投稿狀態</div>
          <h1 className="font-display text-[30px]">我的投稿</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            查看你在每場比賽、每一輪的投稿進度。已被淘汰的話，後續輪次只能投票，不能再投稿。
          </p>
        </div>

        {regs.length === 0 ? (
          <EmptyState icon="inbox" title="你還沒有報名任何比賽" sub="先去活動頁報名一場比賽，這裡就會出現投稿進度" />
        ) : (
          regs.map((reg) => {
            const eliminatedRound = reg.eliminated_in_round_id
              ? (rounds ?? []).find((r) => r.id === reg.eliminated_in_round_id)
              : null;
            const compRounds = (rounds ?? []).filter((r) => r.competition_id === reg.competition_id);

            return (
              <div key={reg.id} className="mb-7">
                <h2 className="mb-3 text-[16px] font-semibold">{oneName(reg.competitions)}</h2>

                {reg.status === "eliminated" && (
                  <div className="mb-3 flex items-center gap-2.5 rounded-[11px] border border-bad/30 bg-bad/8 px-4 py-2.75 text-[12.5px] text-bad">
                    <Icon name="alert" size={15} />
                    你已於「{eliminatedRound?.name ?? "某輪"}」遭淘汰 — 後續輪次僅保留投票資格，無法再投稿
                  </div>
                )}

                {compRounds.length === 0 ? (
                  <EmptyState icon="inbox" title="這場比賽還沒有任何輪次" sub="等主辦方設定賽制後再回來看看" />
                ) : (
                  compRounds.map((round) => {
                    const subState = submissionByKey.get(`${round.id}:${reg.id}`);
                    const meta = subState ? SUBMISSION_STATE_META[subState] : null;
                    return (
                      <div key={round.id} className="glass mb-2 flex items-center gap-4 px-4.5 py-4">
                        <div className="flex-1 text-[13.5px]">{round.name}</div>
                        <div className="text-[11.5px] text-ink-faint">
                          {!subState && !round.allows_new_submissions ? "本輪未開放投稿" : " "}
                        </div>
                        {meta ? (
                          <span
                            className={`inline-flex items-center gap-1.25 rounded-full border px-2.5 py-1 text-[11px] ${STATE_PILL_CLASS[meta.cls]}`}
                          >
                            {meta.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.25 rounded-full border border-panel-border px-2.5 py-1 text-[11px] text-ink-faint">
                            尚未投稿
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
