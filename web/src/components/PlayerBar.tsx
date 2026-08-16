"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";

interface PlayerBarProps {
  title?: string;
}

export function PlayerBar({ title = "未命名作品 #2" }: PlayerBarProps) {
  const [playing, setPlaying] = useState(true);

  return (
    <div className="glass fixed right-0 bottom-0 left-0 z-40 flex items-center gap-4.5 px-6.5 py-3">
      <div className="h-11 w-11 flex-none rounded-[9px] border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c]" />
      <div className="w-45 flex-none">
        <div className="mb-0.5 flex items-center gap-1.5 text-[13px]">
          {playing && (
            <span className="now-playing-eq">
              <i />
              <i />
              <i />
            </span>
          )}
          {title}
        </div>
        <div className="text-[11px] text-ink-faint">{playing ? "播放中" : "已暫停"} · 匿名</div>
      </div>
      <div className="flex flex-none items-center gap-3.5">
        <button className="text-ink-dim transition-transform hover:scale-110 hover:text-ink">
          <Icon name="prev" />
        </button>
        <button
          onClick={() => setPlaying(!playing)}
          className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 text-[#1a0e08] transition-transform hover:scale-108 active:scale-92"
        >
          <Icon name={playing ? "pause" : "play"} size={15} />
        </button>
        <button className="text-ink-dim transition-transform hover:scale-110 hover:text-ink">
          <Icon name="next" />
        </button>
      </div>
      <div className="flex flex-1 items-center gap-2.5 text-[10.5px] text-ink-faint">
        <span>1:14</span>
        <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/12">
          <span className="absolute top-0 bottom-0 left-0 w-[38%] rounded-full bg-gradient-to-r from-[#ff9457] via-accent to-accent-2" />
        </div>
        <span>3:22</span>
      </div>
    </div>
  );
}
