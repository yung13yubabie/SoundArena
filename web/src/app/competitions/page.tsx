"use client";

import { useState, type ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { EmptyState } from "@/components/EmptyState";
import { ReportButton } from "@/components/ReportButton";
import { PlayerBar } from "@/components/PlayerBar";

interface Track {
  id: string;
  title: string;
}

function tracks(n: number, prefix: string): Track[] {
  return Array.from({ length: n }).map((_, i) => ({ id: `${prefix}-${i}`, title: `未命名作品 #${i + 1}` }));
}

function RoundGroup({
  label,
  count,
  defaultOpen = false,
  children,
  empty = false,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
  empty?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2.5 rounded-xl">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-panel-border bg-white/[0.03] px-4 py-3.25 hover:bg-white/[0.05]"
      >
        <Icon name="chevron" size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="flex-1 text-left text-[12.5px] tracking-wide text-accent uppercase">{label}</span>
        <span className="text-[11px] text-ink-faint">{empty ? "0 首" : `${count} 首`}</span>
      </button>
      {open && <div className="flex flex-col gap-1.5 px-1 pt-2 pb-3.5">{children}</div>}
    </div>
  );
}

function TrackRow({ t, active, onPlay }: { t: Track; active: boolean; onPlay: () => void }) {
  return (
    <div
      onClick={onPlay}
      className={`flex cursor-pointer items-center gap-3.5 rounded-[11px] border px-3.5 py-2.5 ${
        active ? "border-accent/25 bg-accent/9" : "border-transparent hover:bg-white/[0.03]"
      }`}
    >
      <div
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border ${
          active ? "border-transparent bg-gradient-to-r from-[#ff9457] via-accent to-accent-2" : "border-panel-border bg-white/[0.06]"
        }`}
      >
        <Icon name={active ? "pause" : "play"} size={13} />
      </div>
      <div className="h-10 w-10 flex-none rounded-lg border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px]">
          {active && (
            <span className="now-playing-eq mr-1.5">
              <i />
              <i />
              <i />
            </span>
          )}
          {t.title}
        </div>
        <div className="text-[11.5px] text-ink-faint">作者於匿名輪次不顯示</div>
      </div>
      <span className="rounded-full border border-accent/35 bg-accent/8 px-2.25 py-0.75 text-[11px] text-accent">未投票</span>
      <button
        title="查看所屬活動"
        onClick={(e) => e.stopPropagation()}
        className="text-ink-dim transition-transform hover:scale-110 hover:text-ink"
      >
        <Icon name="externalLink" size={14} />
      </button>
    </div>
  );
}

export default function CompetitionsPage() {
  const [mode, setMode] = useState<"海選" | "對戰">("海選");
  const [nowPlaying, setNowPlaying] = useState("r1-1");
  const allTracks: Record<string, { title: string }> = {
    ...Object.fromEntries(tracks(5, "r1").map((t) => [t.id, t])),
    ...Object.fromEntries(tracks(3, "r2").map((t) => [t.id, t])),
    "duel-a": { title: "參賽作品 A" },
    "duel-b": { title: "參賽作品 B" },
  };

  return (
    <div>
      <SiteHeader authed active="competitions" />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 擂台</div>
          <h1 className="font-display text-[30px]">深夜擂台 EP.03</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            全站僅一個播放器實例；清單只是可點擊列表，不是各自獨立的嵌入播放器 —
            換歌時銷毀重建音源，避免同時播放。清單依輪次摺疊分組，比照播放清單的瀏覽習慣。
          </p>
          <ReportButton target="深夜擂台 EP.03" />
        </div>

        <div className="mb-5.5 flex gap-2">
          <button
            onClick={() => setMode("海選")}
            className={`rounded-[10px] px-4.5 py-2.5 text-[13.5px] font-semibold ${
              mode === "海選"
                ? "bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 text-[#1a0e08]"
                : "border border-panel-border bg-white/[0.04] text-ink"
            }`}
          >
            海選模式（清單）
          </button>
          <button
            onClick={() => setMode("對戰")}
            className={`rounded-[10px] px-4.5 py-2.5 text-[13.5px] font-semibold ${
              mode === "對戰"
                ? "bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 text-[#1a0e08]"
                : "border border-panel-border bg-white/[0.04] text-ink"
            }`}
          >
            對戰模式（並排）
          </button>
        </div>

        {mode === "海選" ? (
          <>
            <RoundGroup label="第 1 輪 · 海選" count={5} defaultOpen>
              {tracks(5, "r1").map((t) => (
                <TrackRow key={t.id} t={t} active={nowPlaying === t.id} onPlay={() => setNowPlaying(t.id)} />
              ))}
            </RoundGroup>
            <RoundGroup label="第 2 輪 · 複賽" count={3}>
              {tracks(3, "r2").map((t) => (
                <TrackRow key={t.id} t={t} active={nowPlaying === t.id} onPlay={() => setNowPlaying(t.id)} />
              ))}
            </RoundGroup>
            <RoundGroup label="第 3 輪 · 決賽" count={0} empty defaultOpen>
              <EmptyState icon="inbox" title="決賽尚未開放投稿" sub="複賽晉級名單公布後，本輪清單才會出現作品" />
            </RoundGroup>
          </>
        ) : (
          <div className="mb-5.5 grid grid-cols-[1fr_auto_1fr] items-center gap-4.5">
            <div className="glass p-5.5 text-center">
              <div className="mx-auto mb-3.5 flex h-30 w-30 items-center justify-center rounded-xl border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c] text-[11px] text-ink-faint">
                A
              </div>
              <div className="mb-1 text-sm">參賽作品 A</div>
              <button
                onClick={() => setNowPlaying("duel-a")}
                className={`flex w-full items-center justify-center gap-2 rounded-[10px] px-4.5 py-2.5 text-[13.5px] font-semibold ${
                  nowPlaying === "duel-a"
                    ? "bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 text-[#1a0e08]"
                    : "border border-panel-border bg-white/[0.04] text-ink"
                }`}
              >
                {nowPlaying === "duel-a" ? (
                  <span className="now-playing-eq">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <Icon name="play" />
                )}
                播放
              </button>
            </div>
            <div className="font-display text-[22px] text-ink-faint italic">VS</div>
            <div className="glass p-5.5 text-center">
              <div className="mx-auto mb-3.5 flex h-30 w-30 items-center justify-center rounded-xl border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c] text-[11px] text-ink-faint">
                B
              </div>
              <div className="mb-1 text-sm">參賽作品 B</div>
              <button
                onClick={() => setNowPlaying("duel-b")}
                className={`flex w-full items-center justify-center gap-2 rounded-[10px] px-4.5 py-2.5 text-[13.5px] font-semibold ${
                  nowPlaying === "duel-b"
                    ? "bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 text-[#1a0e08]"
                    : "border border-panel-border bg-white/[0.04] text-ink"
                }`}
              >
                {nowPlaying === "duel-b" ? (
                  <span className="now-playing-eq">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <Icon name="play" />
                )}
                播放
              </button>
            </div>
          </div>
        )}

        <PlayerBar title={allTracks[nowPlaying]?.title || "未命名作品"} />
      </div>
    </div>
  );
}
