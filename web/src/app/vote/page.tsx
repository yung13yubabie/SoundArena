"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { EmptyState } from "@/components/EmptyState";
import { PlayerBar } from "@/components/PlayerBar";

export default function VotePage() {
  const [showEmpty, setShowEmpty] = useState(false);
  const [votedId, setVotedId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  return (
    <div>
      <SiteHeader authed active="vote" />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 投票</div>
          <h1 className="font-display text-[30px]">本輪投票</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            本輪投票匿名進行，看不到作者是誰。
          </p>
        </div>

        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-[9px] border border-accent/25 bg-accent/8 px-3 py-2 text-[11.5px] text-accent">
            <Icon name="eyeOff" size={14} />
            投票截止後會公開作者身份
          </div>
          <button
            onClick={() => setShowEmpty(!showEmpty)}
            className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink"
          >
            {showEmpty ? "顯示範例資料" : "檢視空狀態"}
          </button>
        </div>

        {showEmpty ? (
          <EmptyState icon="inbox" title="目前沒有可投票的作品" sub="本輪投稿審核尚未完成，通過審核的作品會自動出現在這裡" />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="glass p-4.5"
                style={playingId === n ? { borderColor: "rgba(255,106,61,.4)" } : undefined}
              >
                <div className="mb-2.5 text-[11px] text-ink-faint">投稿 #{String(n).padStart(2, "0")}</div>
                <div className="mb-3 aspect-video rounded-[9px] border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c]" />
                <div className="mb-3.5 text-[13.5px] text-ink-dim italic">— 標題於匿名階段不顯示 —</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPlayingId(n)}
                    className="flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2.25 text-[13.5px] font-semibold text-ink"
                  >
                    {playingId === n ? (
                      <span className="now-playing-eq">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <Icon name="play" size={13} />
                    )}
                    播放
                  </button>
                  {n === 2 ? (
                    <button
                      disabled
                      className="flex-1 justify-center rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2.25 text-[13.5px] font-semibold text-ink opacity-45"
                    >
                      這是你的作品
                    </button>
                  ) : votedId === n ? (
                    <button
                      disabled
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2.25 text-[13.5px] font-semibold text-ok opacity-45"
                    >
                      <Icon name="check" size={13} /> 已投這首
                    </button>
                  ) : (
                    <button
                      disabled={votedId !== null}
                      onClick={() => setVotedId(n)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3.5 py-2.25 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
                    >
                      <Icon name="check" size={13} /> 投這首
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {votedId && (
          <div className="mt-5 flex w-fit items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-3.5 text-[12.5px] text-ok">
            <Icon name="check" /> 已完成本輪投票，感謝參與
          </div>
        )}
        <PlayerBar />
      </div>
    </div>
  );
}
