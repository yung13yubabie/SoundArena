"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/lib/icons";
import { computeRanking } from "@/lib/ranking";
import { saveScore, setEliminated, finalizeRoundResults } from "./actions";

export interface JudgeScoreItem {
  id: string;
  label: string;
  kind: "weighted" | "bonus";
  weightPercent: number | null;
  templateKey: string | null;
}

export interface JudgeSubmission {
  id: string;
  label: string;
  registrationId: string;
  eliminated: boolean;
  values: Record<string, number>;
  processDoc: string | null;
  ethicalSourcingDeclared: boolean;
}

export function JudgeBoard({
  roundId,
  scoreItems,
  submissions,
  votingClosesAt,
  resultsFinalizedAt,
}: {
  roundId: string;
  scoreItems: JudgeScoreItem[];
  submissions: JudgeSubmission[];
  votingClosesAt: string | null;
  resultsFinalizedAt: string | null;
}) {
  const [subs, setSubs] = useState(submissions);
  const [showFormula, setShowFormula] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [finalized, setFinalized] = useState(resultsFinalizedAt);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const votingClosed = votingClosesAt !== null && new Date(votingClosesAt) <= new Date();

  const confirmResults = () => {
    setFinalizeError(null);
    startTransition(async () => {
      const result = await finalizeRoundResults(roundId);
      if ("error" in result) {
        setFinalizeError(result.error);
        return;
      }
      setFinalized(new Date().toISOString());
    });
  };

  const toggleExpanded = (submissionId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  };

  const weightSum = scoreItems.filter((i) => i.kind === "weighted").reduce((s, i) => s + (i.weightPercent ?? 0), 0);
  const totals = useMemo(() => computeRanking(scoreItems, subs), [scoreItems, subs]);
  const totalById = new Map(totals.map((t) => [t.id, t]));
  const ranked = [...subs].sort((a, b) => (totalById.get(b.id)?.total ?? 0) - (totalById.get(a.id)?.total ?? 0));

  const setValue = (submissionId: string, itemId: string, value: number) => {
    setSubs((prev) => prev.map((s) => (s.id === submissionId ? { ...s, values: { ...s.values, [itemId]: value } } : s)));
  };

  const save = (submissionId: string, itemId: string, value: number) => {
    const key = `${submissionId}:${itemId}`;
    setSavingKey(key);
    startTransition(async () => {
      await saveScore(submissionId, itemId, value);
      setSavingKey((k) => (k === key ? null : k));
    });
  };

  const toggleEliminated = (submissionId: string, registrationId: string, next: boolean) => {
    setSubs((prev) => prev.map((s) => (s.id === submissionId ? { ...s, eliminated: next } : s)));
    startTransition(() => {
      setEliminated(registrationId, roundId, next);
    });
  };

  return (
    <div>
      <div className="glass mb-3.5 flex flex-wrap items-center justify-between gap-2.5 px-4 py-3.5">
        <div className="text-[12.5px] leading-relaxed text-ink-dim">
          {finalized ? (
            <>本輪結果已確認,若這一輪之後接著隊伍賽,系統會依此開始分組。</>
          ) : votingClosed ? (
            <>投票已截止,確認淘汰名單無誤後按下「確認本輪結果」——如果下一輪是隊伍賽,分組要等這個動作完成才會開始。</>
          ) : (
            <>投票尚未截止,先完成評分與淘汰標記,投票截止後才能確認本輪結果。</>
          )}
          {finalizeError && <div className="mt-1 text-bad">{finalizeError}</div>}
        </div>
        <button
          onClick={confirmResults}
          disabled={isPending || !votingClosed || !!finalized}
          className="rounded-[9px] border border-accent/40 bg-accent/12 px-3.5 py-1.75 text-[12px] font-semibold text-accent disabled:opacity-40"
        >
          {finalized ? "已確認本輪結果" : "確認本輪結果"}
        </button>
      </div>

      {ranked.map((s, rank) => {
        const t = totalById.get(s.id)!;
        return (
          <div key={s.id} className="glass mb-3.5 pt-1.5">
            <div className="flex items-center justify-between px-3.5 pt-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-panel-border text-[11px] text-ink-dim">
                  {rank + 1}
                </span>
                <span className="text-[14px] font-semibold">{s.label}</span>
              </div>
              <button
                onClick={() => toggleEliminated(s.id, s.registrationId, !s.eliminated)}
                disabled={isPending}
                className={`rounded-[9px] border px-3 py-1.25 text-[11.5px] font-semibold disabled:opacity-45 ${
                  s.eliminated
                    ? "border-bad/35 bg-bad/8 text-bad"
                    : "border-panel-border bg-white/[0.04] text-ink-dim hover:text-ink"
                }`}
              >
                {s.eliminated ? "已標記淘汰(點擊還原)" : "標記本輪淘汰"}
              </button>
            </div>

            <div className="border-t border-panel-border px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => toggleExpanded(s.id)}
                  className="text-[11.5px] text-accent underline underline-offset-3"
                >
                  {expandedIds.has(s.id) ? "收起" : "展開"}創作過程說明（Process Doc）
                </button>
                {s.ethicalSourcingDeclared && (
                  <span className="rounded-full border border-ok/35 bg-ok/8 px-2.25 py-0.75 text-[10.5px] text-ok">
                    已聲明使用公平訓練工具（自申制，未經平台驗證）
                  </span>
                )}
              </div>
              {expandedIds.has(s.id) && (
                <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-panel-border bg-black/20 p-3 text-[12.5px] leading-relaxed text-ink-dim">
                  {s.processDoc?.trim() ? s.processDoc : "（參賽者未提供創作過程說明）"}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">
                    加權計分項目(合計 {Math.round(weightSum)}%)
                  </th>
                  <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">來源</th>
                  <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">數值</th>
                  <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">權重</th>
                </tr>
              </thead>
              <tbody>
                {scoreItems
                  .filter((i) => i.kind === "weighted")
                  .map((item) => {
                    const isVote = item.templateKey === "vote";
                    const isAudienceRating = item.templateKey === "audience_ai_usage_rating";
                    const isAutoComputed = isVote || isAudienceRating;
                    const key = `${s.id}:${item.id}`;
                    return (
                      <tr key={item.id}>
                        <td className="border-t border-white/5 px-3.5 py-3 text-ink-dim">{item.label}</td>
                        <td className="border-t border-white/5 px-3.5 py-3">
                          <span
                            className={`rounded-full border px-2.25 py-0.75 text-[11px] ${
                              isAutoComputed
                                ? "border-[#8fb3d9]/35 bg-[#8fb3d9]/8 text-[#8fb3d9]"
                                : "border-accent/40 bg-accent/10 text-accent"
                            }`}
                          >
                            {isAutoComputed ? "系統自動" : "人工輸入"}
                          </span>
                        </td>
                        <td className="border-t border-white/5 px-3.5 py-3">
                          {isVote ? (
                            `${s.values[item.id] ?? 0} 票`
                          ) : isAudienceRating ? (
                            `平均 ${(s.values[item.id] ?? 0).toFixed(1)} 分`
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                value={s.values[item.id] ?? 0}
                                onChange={(e) => setValue(s.id, item.id, Number(e.target.value))}
                                onBlur={(e) => save(s.id, item.id, Number(e.target.value))}
                                className="w-24 rounded-lg border border-panel-border bg-black/25 px-2.25 py-1.25 text-[12.5px] text-ink"
                              />
                              {savingKey === key && <span className="text-[10.5px] text-ink-faint">儲存中…</span>}
                            </div>
                          )}
                        </td>
                        <td className="border-t border-white/5 px-3.5 py-3">{item.weightPercent}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            </div>

            {scoreItems.some((i) => i.kind === "bonus") && (
              <div className="border-t border-panel-border px-4.5 py-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12.5px] text-ink-dim">額外加分項(不計入 100%,直接加總)</span>
                  <span className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.25 py-0.75 text-[11px] text-accent">
                    <Icon name="crown" size={11} /> 人工輸入
                  </span>
                </div>
                {scoreItems
                  .filter((i) => i.kind === "bonus")
                  .map((item) => {
                    const key = `${s.id}:${item.id}`;
                    return (
                      <div key={item.id} className="mb-1.5 flex items-center gap-2.5">
                        <span className="w-32 text-[13px]">{item.label}</span>
                        <input
                          type="number"
                          min="0"
                          value={s.values[item.id] ?? 0}
                          onChange={(e) => setValue(s.id, item.id, Number(e.target.value))}
                          onBlur={(e) => save(s.id, item.id, Number(e.target.value))}
                          className="w-24 rounded-lg border border-panel-border bg-black/25 px-2.25 py-1.25 text-[12.5px] text-ink"
                        />
                        {savingKey === key && <span className="text-[10.5px] text-ink-faint">儲存中…</span>}
                      </div>
                    );
                  })}
              </div>
            )}

            <div className="flex items-baseline justify-between border-t border-panel-border px-3.5 py-3">
              <span className="text-[12.5px] text-ink-dim">
                加權小計(滿分 100) {t.bonusTotal > 0 && <>+ 額外加分 {t.bonusTotal.toFixed(1)}</>}
              </span>
              <span className="font-display text-[20px] text-accent">{t.total.toFixed(1)}</span>
            </div>
          </div>
        );
      })}

      <button onClick={() => setShowFormula(!showFormula)} className="text-[11.5px] text-accent underline underline-offset-3">
        {showFormula ? "收起" : "查看"}計算方式(規格要求評分公式須公開透明)
      </button>
      {showFormula && (
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
      )}
    </div>
  );
}
