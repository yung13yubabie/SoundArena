"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";

const MOCK_DISCOVERY_COMPETITIONS = [
  { id: "c1", name: "深夜擂台 EP.03", organizer: "夜遊者", status: "active", participants: 24, submissions: 31 },
  { id: "c2", name: "Lo-fi 對決之夜", organizer: "霓虹貓", status: "active", participants: 12, submissions: 15 },
  { id: "c3", name: "新手擂台盃", organizer: "午夜鯨", status: "upcoming", participants: 5, submissions: 0 },
  { id: "c4", name: "夏季主題輪 Vol.2", organizer: "鹽湖旅人", status: "ended", participants: 41, submissions: 58 },
] as const;

const DISCOVERY_STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: "進行中", className: "border-ok/35 bg-ok/8 text-ok" },
  upcoming: { label: "即將開始", className: "border-accent/35 bg-accent/8 text-accent" },
  ended: { label: "已結束", className: "border-panel-border text-ink-dim" },
};

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "active", label: "進行中" },
  { key: "upcoming", label: "即將開始" },
  { key: "ended", label: "已結束" },
];

export default function HomePage() {
  const [filter, setFilter] = useState("all");
  const filtered =
    filter === "all" ? MOCK_DISCOVERY_COMPETITIONS : MOCK_DISCOVERY_COMPETITIONS.filter((c) => c.status === filter);

  return (
    <div>
      <SiteHeader authed={false} />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · Discovery（不需登入）</div>
          <h1 className="font-display text-[30px]">探索比賽</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            這裡列出全站主辦方建立的所有比賽。開放公開展示的作品可以直接試聽，不用登入。
          </p>
        </div>

        <div className="mb-5.5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3.5 py-1.75 text-[12.5px] transition-colors ${
                filter === f.key
                  ? "border-accent/40 bg-accent/16 text-ink"
                  : "border-panel-border bg-white/[0.04] text-ink-dim hover:bg-white/[0.08] hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="inbox" title="沒有符合條件的比賽" sub="試試看調整篩選條件" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {filtered.map((c) => {
              const meta = DISCOVERY_STATUS_META[c.status];
              return (
                <div key={c.id} className="glass p-4.5">
                  <div className="mb-2.5 flex items-start justify-between">
                    <span className={`rounded-full border px-2.25 py-0.75 text-[11px] ${meta.className}`}>{meta.label}</span>
                  </div>
                  <div className="mb-1 text-[15.5px]">{c.name}</div>
                  <div className="mb-3 text-[12px] text-ink-faint">由 {c.organizer} 主辦</div>
                  <div className="flex gap-3.5 text-[11.5px] text-ink-dim">
                    <span>{c.participants} 位參賽者</span>
                    <span>{c.submissions} 件投稿</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
