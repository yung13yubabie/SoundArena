"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/lib/icons";
import { PlayerBar } from "@/components/PlayerBar";
import { castWildcardRevivalVote } from "../actions";

export interface WildcardCandidate {
  registrationId: string;
  submissionId: string | null;
  title: string;
  isOwn: boolean;
  sunoShareUrl: string | null;
}

export function WildcardVoteList({
  eventId,
  candidates,
  initialVotedId,
}: {
  eventId: string;
  candidates: WildcardCandidate[];
  initialVotedId: string | null;
}) {
  const [votedId, setVotedId] = useState(initialVotedId);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const vote = (registrationId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await castWildcardRevivalVote(eventId, registrationId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setVotedId(registrationId);
      }
    });
  };

  const playing = candidates.find((c) => c.submissionId === playingId);

  return (
    <div>
      {error && <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {candidates.map((c) => (
          <div key={c.registrationId} className="glass p-4.5">
            <div className="mb-3.5 text-[13.5px] italic text-ink-dim">{c.title}</div>
            <div className="flex gap-2">
              {c.submissionId && (
                <button
                  onClick={() => setPlayingId(c.submissionId)}
                  className="focus-ring flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2.25 text-[13.5px] font-semibold text-ink hover:border-accent/40"
                >
                  {playingId === c.submissionId ? (
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
              )}
              {c.isOwn ? (
                <button disabled className="flex-1 justify-center rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2.25 text-[13.5px] font-semibold text-ink opacity-45">
                  這是你自己
                </button>
              ) : votedId === c.registrationId ? (
                <button disabled className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2.25 text-[13.5px] font-semibold text-ok opacity-45">
                  <Icon name="check" size={13} /> 已投這位
                </button>
              ) : (
                <button
                  disabled={votedId !== null || isPending}
                  onClick={() => vote(c.registrationId)}
                  className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3.5 py-2.25 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
                >
                  <Icon name="check" size={13} /> 投這位復活
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {votedId && (
        <div className="mt-5 flex w-fit items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-3.5 text-[12.5px] text-ok">
          <Icon name="check" /> 已完成外卡復活投票，感謝參與
        </div>
      )}
      {playing && <PlayerBar key={playing.submissionId} submissionId={playing.submissionId!} title={playing.title} fallbackUrl={playing.sunoShareUrl ?? undefined} />}
    </div>
  );
}
