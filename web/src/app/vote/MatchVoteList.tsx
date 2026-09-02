"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/lib/icons";
import { PlayerBar } from "@/components/PlayerBar";
import { castMatchVote, castTeamMatchVote } from "./actions";

export interface MatchVoteSide {
  registrationId: string;
  teamId: string | null;
  teamName: string | null;
  submissionId: string | null;
  title: string;
  isOwn: boolean;
  sunoShareUrl: string | null;
}

export interface MatchVoteItem {
  matchId: string;
  poolName: string;
  a: MatchVoteSide;
  b: MatchVoteSide;
}

export function MatchVoteList({
  matches,
  initialVotedByMatch,
}: {
  matches: MatchVoteItem[];
  initialVotedByMatch: Record<string, string>;
}) {
  const [votedByMatch, setVotedByMatch] = useState(initialVotedByMatch);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const vote = (matchId: string, side: MatchVoteSide) => {
    const choiceId = side.teamId ?? side.registrationId;
    setError(null);
    startTransition(async () => {
      const result = side.teamId ? await castTeamMatchVote(matchId, side.teamId) : await castMatchVote(matchId, side.registrationId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setVotedByMatch((prev) => ({ ...prev, [matchId]: choiceId }));
      }
    });
  };

  const allSides = matches.flatMap((m) => [m.a, m.b]);
  const playing = allSides.find((s) => s.submissionId === playingId);

  return (
    <div>
      {error && <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>}
      <div className="flex flex-col gap-4">
        {matches.map((m) => {
          const votedFor = votedByMatch[m.matchId];
          const canVote = !m.a.isOwn && !m.b.isOwn;
          return (
            <div key={m.matchId} className="glass p-4.5">
              <div className="mb-3 text-[11px] tracking-wide text-ink-faint uppercase">{m.poolName}</div>
              <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                {[m.a, m.b].map((side) => {
                  const choiceId = side.teamId ?? side.registrationId;
                  return (
                    <div key={choiceId} className="rounded-[10px] border border-panel-border bg-white/[0.02] p-3.5">
                      {side.teamName && <div className="mb-1 text-[11px] font-semibold text-ink-faint">{side.teamName}</div>}
                      <div className="mb-2.5 text-[13.5px] italic text-ink-dim">{side.title}</div>
                      <div className="flex flex-wrap gap-2">
                        {side.submissionId && (
                          <button
                            onClick={() => setPlayingId(side.submissionId)}
                            className="focus-ring flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.75 text-[12.5px] font-semibold text-ink hover:border-accent/40"
                          >
                            {playingId === side.submissionId ? (
                              <span className="now-playing-eq">
                                <i />
                                <i />
                                <i />
                              </span>
                            ) : (
                              <Icon name="play" size={12} />
                            )}
                            播放
                          </button>
                        )}
                        {side.isOwn ? (
                          <span className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.75 text-[12.5px] text-ink-faint">
                            {side.teamId ? "這是你的隊伍" : "這是你的作品"}
                          </span>
                        ) : votedFor === choiceId ? (
                          <span className="flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.75 text-[12.5px] font-semibold text-ok">
                            <Icon name="check" size={12} /> 已投這邊
                          </span>
                        ) : (
                          canVote && (
                            <button
                              disabled={!!votedFor || isPending}
                              onClick={() => vote(m.matchId, side)}
                              className="focus-ring flex items-center gap-1.5 rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3 py-1.75 text-[12.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
                            >
                              <Icon name="check" size={12} /> 投這邊
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* 中間欄位僅用於 sm 以上斷點插入 "vs" 視覺分隔,手機版兩側各自堆疊即可 */}
                <div className="hidden text-center text-[12px] text-ink-faint sm:block">vs</div>
              </div>
              {(m.a.isOwn || m.b.isOwn) && (
                <p className="mt-2.5 text-[11.5px] text-ink-faint">
                  {m.a.teamId || m.b.teamId ? "你是這場其中一隊的成員,不能投這一場" : "你是這場的參賽者之一,不能投這一場"}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {playing && (
        <PlayerBar key={playing.submissionId} submissionId={playing.submissionId!} title={playing.title} fallbackUrl={playing.sunoShareUrl ?? undefined} />
      )}
    </div>
  );
}
