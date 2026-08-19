import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { getRoundResults, rankOf } from "@/lib/roundResults";

interface RoundPickerRow {
  id: string;
  name: string;
  voting_closes_at: string;
  competitions: { name: string } | { name: string }[] | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const { round: roundId } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const authed = !!claims?.claims?.sub;
  const nowIso = new Date().toISOString();

  if (!roundId) {
    const { data: rounds } = await supabase
      .from("rounds")
      .select("id, name, voting_closes_at, competitions!inner(name, is_public)")
      .eq("competitions.is_public", true)
      .not("voting_closes_at", "is", null)
      .lt("voting_closes_at", nowIso)
      .order("voting_closes_at", { ascending: false });

    const closedRounds = (rounds ?? []) as unknown as RoundPickerRow[];

    return (
      <div>
        <SiteHeader authed={authed} active="results" />
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <div className="mb-7">
            <h1 className="font-display text-[30px]">選擇要查看的場次結果</h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
              以下是投票已截止、結果已公開的輪次。
            </p>
          </div>
          {closedRounds.length === 0 ? (
            <EmptyState icon="inbox" title="目前還沒有已公開的結果" sub="等任一輪投票截止後,結果會出現在這裡" />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {closedRounds.map((r) => (
                <Link key={r.id} href={`/results?round=${r.id}`} className="glass block p-4.5 hover:border-accent/30">
                  <div className="mb-1 text-[15px]">{r.name}</div>
                  <div className="text-[12px] text-ink-faint">{one(r.competitions)?.name ?? "未命名比賽"}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const { data: round } = await supabase
    .from("rounds")
    .select("id, name, voting_closes_at, competitions(id, name, is_public)")
    .eq("id", roundId)
    .maybeSingle();

  const competition = round ? one(round.competitions) : null;
  const resultsAvailable =
    !!round && !!competition?.is_public && !!round.voting_closes_at && round.voting_closes_at <= nowIso;

  const { submissions, scoreItems, ranking, weightSum, valuesBySubmission } = resultsAvailable
    ? await getRoundResults(supabase, roundId, competition!.id)
    : { submissions: [], scoreItems: [], ranking: [], weightSum: 0, valuesBySubmission: new Map<string, Record<string, number>>() };

  const sorted = [...submissions].sort((a, b) => rankOf(a.submission_id, ranking) - rankOf(b.submission_id, ranking));

  return (
    <div>
      <SiteHeader authed={authed} active="results" />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7">
          <h1 className="font-display text-[30px]">{round?.name ?? "結果"} — {competition?.name ?? ""}</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            分數計算方式完全公開,任何人都能核對。
          </p>
        </div>

        {!resultsAvailable ? (
          <EmptyState icon="inbox" title="這一輪結果還沒公開" sub="投票期還沒截止,或這不是公開比賽" />
        ) : sorted.length === 0 ? (
          <EmptyState icon="inbox" title="這一輪沒有通過審核的投稿" sub="" />
        ) : (
          <>
            {sorted.map((s, idx) => {
              const total = ranking.find((r) => r.id === s.submission_id)!;
              const rank = rankOf(s.submission_id, ranking);
              return (
                <div key={s.submission_id} className="glass mb-3.5 pt-1.5">
                  <div className="flex items-center gap-2.5 px-3.5 pt-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-panel-border text-[11px] text-ink-dim">
                      {rank}
                    </span>
                    {s.display_name ? (
                      <>
                        <span className="text-[14px] font-semibold">{s.title ?? "未命名作品"}</span>
                        <span className="text-[12px] text-ink-faint">by {s.display_name}</span>
                      </>
                    ) : (
                      <span className="text-[14px] font-semibold italic text-ink-dim">
                        匿名作品 #{String(idx + 1).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
                    <thead>
                      <tr>
                        <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">
                          加權計分項目(合計 {Math.round(weightSum)}%)
                        </th>
                        <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">數值</th>
                        <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">權重</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoreItems
                        .filter((i) => i.kind === "weighted")
                        .map((item) => (
                          <tr key={item.id}>
                            <td className="border-t border-white/5 px-3.5 py-3 text-ink-dim">{item.label}</td>
                            <td className="border-t border-white/5 px-3.5 py-3">
                              {(valuesBySubmission.get(s.submission_id) ?? {})[item.id] ?? 0}
                              {item.templateKey === "vote" ? " 票" : ""}
                            </td>
                            <td className="border-t border-white/5 px-3.5 py-3">{item.weightPercent}%</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-panel-border px-3.5 py-3">
                    <span className="text-[12.5px] text-ink-dim">
                      加權小計(滿分 100){total.bonusTotal > 0 && <> + 額外加分 {total.bonusTotal.toFixed(1)}</>}
                    </span>
                    <span className="font-display text-[20px] text-accent">{total.total.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}

            <details className="mt-3.5">
              <summary className="cursor-pointer text-[11.5px] text-accent underline underline-offset-3">
                查看計算方式(規格要求評分公式須公開透明)
              </summary>
              <div className="glass mt-3.5 px-4 py-3.5 text-[12px] leading-loose text-ink-dim">
                每個加權項目先在本輪所有作品中正規化(該作品數值 ÷ 本輪最高值 × 100),再乘以權重相加:
                <br />
                加權小計 ={" "}
                {scoreItems
                  .filter((i) => i.kind === "weighted")
                  .map((i) => (
                    <code key={i.id} className="mr-1.5 font-mono text-accent">
                      {i.label} × {i.weightPercent}%
                    </code>
                  ))}
                (權重總和固定 {Math.round(weightSum)}%)
                <br />
                總分 = <code className="font-mono text-accent">加權小計</code>
                {scoreItems.some((i) => i.kind === "bonus") && (
                  <>
                    {" "}
                    +{" "}
                    {scoreItems
                      .filter((i) => i.kind === "bonus")
                      .map((i) => (
                        <code key={i.id} className="mr-1.5 font-mono text-accent">
                          {i.label}
                        </code>
                      ))}
                    (額外加分項,不受 100% 限制,直接加總)
                  </>
                )}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
