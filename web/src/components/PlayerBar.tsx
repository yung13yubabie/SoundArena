"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { getSubmissionPlaybackUrl } from "@/lib/playbackActions";

interface PlayerBarProps {
  submissionId: string;
  title: string;
  fallbackUrl?: string;
}

// 呼叫端務必用 <PlayerBar key={submissionId} .../> ——換播放的作品時要整個
// 重新掛載,讓 status/playing/currentTime/duration 用新的初始值重新開始,
// 不要在 effect 裡同步 setState 重置(cascading render,eslint-plugin-react-hooks
// 的 set-state-in-effect 規則會擋)。

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar({ submissionId, title, fallbackUrl }: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getSubmissionPlaybackUrl(submissionId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setStatus("error");
        return;
      }
      if (!result.url) {
        setStatus("unavailable");
        return;
      }
      if (audioRef.current) {
        audioRef.current.src = result.url;
        audioRef.current.play().catch(() => setPlaying(false));
      }
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="glass fixed right-0 bottom-0 left-0 z-40 flex items-center gap-3 px-4 py-3 md:gap-4.5 md:px-6.5">
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />
      <div className="h-11 w-11 flex-none rounded-[9px] border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c]" />
      <div className="w-28 flex-none md:w-45">
        <div className="mb-0.5 flex items-center gap-1.5 truncate text-[13px]">
          {playing && (
            <span className="now-playing-eq flex-none">
              <i />
              <i />
              <i />
            </span>
          )}
          <span className="truncate">{title}</span>
        </div>
        <div className="truncate text-[11px] text-ink-faint">
          {status === "loading" && "載入中…"}
          {status === "ready" && (playing ? "播放中" : "已暫停")}
          {status === "unavailable" && "尚未上傳音檔"}
          {status === "error" && "無法播放"}
        </div>
      </div>

      {status === "unavailable" ? (
        fallbackUrl ? (
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2 text-[12.5px] font-semibold text-ink transition-colors hover:border-accent/40"
          >
            <Icon name="externalLink" size={13} /> 到 Suno 上聽
          </a>
        ) : (
          <div className="text-[12px] text-ink-faint">這首作品沒有可播放的音檔</div>
        )
      ) : (
        <>
          <div className="flex flex-none items-center gap-2.5 md:gap-3.5">
            <button
              onClick={togglePlay}
              disabled={status !== "ready"}
              className="focus-ring flex h-8.5 w-8.5 items-center justify-center rounded-full bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 text-[#1a0e08] transition-transform hover:scale-108 active:scale-92 disabled:opacity-50"
            >
              <Icon name={playing ? "pause" : "play"} size={15} />
            </button>
          </div>
          <div className="hidden flex-1 items-center gap-2.5 text-[10.5px] text-ink-faint sm:flex">
            <span>{formatTime(currentTime)}</span>
            <div
              onClick={seek}
              className="relative h-[3px] flex-1 cursor-pointer overflow-hidden rounded-full bg-white/12"
            >
              <span
                className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-r from-[#ff9457] via-accent to-accent-2"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span>{formatTime(duration)}</span>
          </div>
        </>
      )}
    </div>
  );
}
