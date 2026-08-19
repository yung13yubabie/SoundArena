"use client";

import { useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "@/lib/icons";
import { PlayerBar } from "@/components/PlayerBar";
import { CommentsPanel } from "@/components/CommentsPanel";
import { castVote } from "./actions";

export interface VoteSubmission {
  id: string;
  title: string;
  isOwn: boolean;
}

export function VoteList({
  roundId,
  submissions,
  initialVotedId,
}: {
  roundId: string;
  submissions: VoteSubmission[];
  initialVotedId: string | null;
}) {
  const [votedId, setVotedId] = useState(initialVotedId);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const reduceMotion = useReducedMotion();

  const vote = (submissionId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await castVote(roundId, submissionId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setVotedId(submissionId);
      }
    });
  };

  const playing = submissions.find((s) => s.id === playingId);

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {submissions.map((s, i) => (
          <motion.div
            key={s.id}
            className="glass p-4.5"
            style={playingId === s.id ? { borderColor: "rgba(255,106,61,.4)" } : undefined}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-3 aspect-video rounded-[9px] border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c]" />
            <div className="mb-3.5 text-[13.5px] text-ink-dim italic">{s.title}</div>
            <div className="flex gap-2">
              <button
                onClick={() => setPlayingId(s.id)}
                className="focus-ring flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2.25 text-[13.5px] font-semibold text-ink transition-colors hover:border-accent/40"
              >
                {playingId === s.id ? (
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
              {s.isOwn ? (
                <button
                  disabled
                  className="flex-1 justify-center rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2.25 text-[13.5px] font-semibold text-ink opacity-45"
                >
                  這是你的作品
                </button>
              ) : votedId === s.id ? (
                <button
                  disabled
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2.25 text-[13.5px] font-semibold text-ok opacity-45"
                >
                  <Icon name="check" size={13} /> 已投這首
                </button>
              ) : (
                <button
                  disabled={votedId !== null || isPending}
                  onClick={() => vote(s.id)}
                  className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3.5 py-2.25 text-[13.5px] font-semibold text-[#1a0e08] transition hover:brightness-110 disabled:opacity-45"
                >
                  <Icon name="check" size={13} /> 投這首
                </button>
              )}
            </div>
            <CommentsPanel submissionId={s.id} canComment={!s.isOwn} canEndorse={false} />
          </motion.div>
        ))}
      </div>
      {votedId && (
        <div className="mt-5 flex w-fit items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-3.5 text-[12.5px] text-ok">
          <Icon name="check" /> 已完成本輪投票,感謝參與
        </div>
      )}
      {playing && <PlayerBar title={playing.title} />}
    </div>
  );
}
