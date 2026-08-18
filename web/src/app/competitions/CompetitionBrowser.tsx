"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { EmptyState } from "@/components/EmptyState";
import { ReportButton } from "@/components/ReportButton";
import { PlayerBar } from "@/components/PlayerBar";

export interface BrowserTrack {
  id: string;
  title: string;
}

export interface BrowserRound {
  id: string;
  name: string;
  tracks: BrowserTrack[];
}

function RoundGroup({
  round,
  defaultOpen,
  nowPlaying,
  onPlay,
}: {
  round: BrowserRound;
  defaultOpen: boolean;
  nowPlaying: string | null;
  onPlay: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2.5 rounded-xl">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-panel-border bg-white/[0.03] px-4 py-3.25 hover:bg-white/[0.05]"
      >
        <Icon name="chevron" size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="flex-1 text-left text-[12.5px] tracking-wide text-accent uppercase">{round.name}</span>
        <span className="text-[11px] text-ink-faint">{round.tracks.length} 首</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-1 pt-2 pb-3.5">
          {round.tracks.length === 0 ? (
            <EmptyState icon="inbox" title="這輪還沒有公開展示的作品" sub="投稿者審核通過後，可以在「隱私設定」開啟公開試聽" />
          ) : (
            round.tracks.map((t) => (
              <div
                key={t.id}
                onClick={() => onPlay(t.id)}
                className={`flex cursor-pointer items-center gap-3.5 rounded-[11px] border px-3.5 py-2.5 ${
                  nowPlaying === t.id ? "border-accent/25 bg-accent/9" : "border-transparent hover:bg-white/[0.03]"
                }`}
              >
                <div
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border ${
                    nowPlaying === t.id
                      ? "border-transparent bg-gradient-to-r from-[#ff9457] via-accent to-accent-2"
                      : "border-panel-border bg-white/[0.06]"
                  }`}
                >
                  <Icon name={nowPlaying === t.id ? "pause" : "play"} size={13} />
                </div>
                <div className="h-10 w-10 flex-none rounded-lg border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c]" />
                <div className="min-w-0 flex-1 truncate text-[13.5px]">{t.title}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function CompetitionBrowser({
  competitionId,
  competitionName,
  rounds,
}: {
  competitionId: string;
  competitionName: string;
  rounds: BrowserRound[];
}) {
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const playingTrack = rounds.flatMap((r) => r.tracks).find((t) => t.id === nowPlaying);
  const hasAnyTracks = rounds.some((r) => r.tracks.length > 0);

  return (
    <div>
      <SiteHeader authed={false} active="competitions" />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 比賽</div>
          <h1 className="font-display text-[30px]">{competitionName}</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            點選任一首開始播放，同一時間只會有一首在播。歌曲依輪次分組，點開輪次就能看到清單。音檔上傳（Cloudflare
            R2）還沒接上，這裡先看得到清單，播放功能之後補上。
          </p>
          <ReportButton competitionId={competitionId} target={competitionName} />
        </div>

        {!hasAnyTracks ? (
          <EmptyState icon="inbox" title="這場比賽還沒有公開展示的作品" sub="投稿者審核通過後，可以在「隱私設定」開啟公開試聽" />
        ) : (
          rounds.map((r, i) => (
            <RoundGroup key={r.id} round={r} defaultOpen={i === 0} nowPlaying={nowPlaying} onPlay={setNowPlaying} />
          ))
        )}
      </div>
      {playingTrack && <PlayerBar title={playingTrack.title} />}
    </div>
  );
}
