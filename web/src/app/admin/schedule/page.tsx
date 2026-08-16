"use client";

import { useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { Icon } from "@/lib/icons";
import { MOCK_COMPETITION } from "@/lib/mockData";

interface PhaseWindow {
  start: string;
  end: string;
}

const PHASES: Array<{ key: "promo" | "submit" | "vote" | "reveal"; label: string }> = [
  { key: "promo", label: "宣傳期" },
  { key: "submit", label: "投稿期" },
  { key: "vote", label: "投票期" },
  { key: "reveal", label: "公布期" },
];

export default function AdminSchedulePage() {
  const [dates, setDates] = useState<Record<"promo" | "submit" | "vote" | "reveal", PhaseWindow> & { registerDeadline: string }>({
    promo: { start: "2026-08-10", end: "2026-08-20" },
    submit: { start: "2026-08-21", end: "2026-09-03" },
    vote: { start: "2026-09-04", end: "2026-09-10" },
    reveal: { start: "2026-09-11", end: "2026-09-11" },
    registerDeadline: "2026-09-10", // demo：故意設在投稿期結束（2026-09-03）之後，觸發邊界錯誤
  });
  const set = (phase: "promo" | "submit" | "vote" | "reveal", field: "start" | "end", val: string) =>
    setDates((d) => ({ ...d, [phase]: { ...d[phase], [field]: val } }));

  const registerAfterSubmitEnd = dates.registerDeadline > dates.submit.end;
  const submitAfterVoteStart = dates.submit.end > dates.vote.start;

  return (
    <AdminShell active="schedule">
      <div className="mb-7">
        <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 時程設定</div>
        <h1 className="font-display text-[30px]">賽事時程 — {MOCK_COMPETITION.name}</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          設定宣傳、投稿、投票、公布四個階段的起訖日期，時間衝突會立即提示。
        </p>
      </div>

      <div className="glass px-5 py-2">
        {PHASES.map((p) => (
          <div key={p.key} className="grid grid-cols-[140px_1fr_1fr] items-center gap-4 border-b border-panel-border py-3.5 last:border-b-0">
            <div className="text-[13.5px] font-semibold">{p.label}</div>
            <div>
              <label className="mb-1.25 block text-[10.5px] tracking-wide text-ink-faint uppercase">開始</label>
              <input
                type="date"
                value={dates[p.key].start}
                onChange={(e) => set(p.key, "start", e.target.value)}
                className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="mb-1.25 block text-[10.5px] tracking-wide text-ink-faint uppercase">結束</label>
              <input
                type="date"
                value={dates[p.key].end}
                onChange={(e) => set(p.key, "end", e.target.value)}
                className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
              />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[140px_1fr_1fr] items-center gap-4 py-3.5">
          <div className="text-[13.5px] font-semibold">報名截止</div>
          <div>
            <label className="mb-1.25 block text-[10.5px] tracking-wide text-ink-faint uppercase">最晚報名日</label>
            <input
              type="date"
              value={dates.registerDeadline}
              onChange={(e) => setDates((d) => ({ ...d, registerDeadline: e.target.value }))}
              className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
            />
          </div>
          <div />
        </div>
        {registerAfterSubmitEnd && (
          <div className="col-span-full mt-1.5 mb-3 flex items-center gap-2 rounded-lg border border-bad/30 bg-bad/8 px-3 py-2 text-[11.5px] text-bad">
            <Icon name="alert" size={14} /> 報名截止日（{dates.registerDeadline}）晚於投稿期結束（{dates.submit.end}）— 違反第 2 節「存取順序」規則，請調整
          </div>
        )}
        {submitAfterVoteStart && (
          <div className="col-span-full mt-1.5 mb-3 flex items-center gap-2 rounded-lg border border-bad/30 bg-bad/8 px-3 py-2 text-[11.5px] text-bad">
            <Icon name="alert" size={14} /> 投稿期結束（{dates.submit.end}）晚於投票期開始（{dates.vote.start}）— 兩階段時間重疊，請調整
          </div>
        )}
      </div>
    </AdminShell>
  );
}
