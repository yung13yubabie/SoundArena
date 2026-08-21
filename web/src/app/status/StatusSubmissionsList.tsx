"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { CommentsPanel } from "@/components/CommentsPanel";
import { PlayerBar } from "@/components/PlayerBar";
import { NotificationToggle } from "./NotificationToggle";
import { deleteMySubmission } from "../submit/actions";
import { SUBMISSION_STATE_META, STATE_PILL_CLASS, type SubmissionState } from "@/lib/mockData";

export interface StatusRegistration {
  id: string;
  competitionId: string;
  competitionName: string;
  status: "active" | "eliminated";
  eliminatedRoundName: string | null;
  notificationsEnabled: boolean;
  reviewStatus: "pending_review" | "approved" | "rejected";
  reviewNote: string | null;
}

export interface StatusRound {
  id: string;
  competitionId: string;
  name: string;
  allowsNewSubmissions: boolean;
  votingOpensAt: string | null;
}

export interface StatusSubmission {
  id: string;
  roundId: string;
  registrationId: string;
  status: SubmissionState;
  title: string | null;
  sunoShareUrl: string;
  reviewNote: string | null;
}

export function StatusSubmissionsList({
  registrations,
  rounds,
  submissions,
}: {
  registrations: StatusRegistration[];
  rounds: StatusRound[];
  submissions: StatusSubmission[];
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const submissionByKey = new Map(submissions.map((s) => [`${s.roundId}:${s.registrationId}`, s]));
  const playing = submissions.find((s) => s.id === playingId);

  function handleDelete(submissionId: string) {
    setError(null);
    setDeletingId(submissionId);
    startTransition(async () => {
      const result = await deleteMySubmission(submissionId);
      setDeletingId(null);
      setConfirmDeleteId(null);
      if ("error" in result) setError(result.error);
      if (playingId === submissionId) setPlayingId(null);
    });
  }

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>
      )}
      {registrations.length === 0 ? null : (
        registrations.map((reg) => {
          const compRounds = rounds.filter((r) => r.competitionId === reg.competitionId);
          return (
            <div key={reg.id} className="mb-7">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[16px] font-semibold">{reg.competitionName}</h2>
                <NotificationToggle registrationId={reg.id} initialEnabled={reg.notificationsEnabled} />
              </div>

              {reg.reviewStatus === "pending_review" && (
                <div className="mb-3 flex items-center gap-2.5 rounded-[11px] border border-warn/30 bg-warn/8 px-4 py-2.75 text-[12.5px] text-warn">
                  <Icon name="alert" size={15} />
                  報名審核中，主辦人審核通過後才能投稿
                </div>
              )}
              {reg.reviewStatus === "rejected" && (
                <div className="mb-3 flex items-center gap-2.5 rounded-[11px] border border-bad/30 bg-bad/8 px-4 py-2.75 text-[12.5px] text-bad">
                  <Icon name="alert" size={15} />
                  <span className="flex-1">報名被退回：{reg.reviewNote || "（主辦人沒有留下原因）"}</span>
                  <Link href={`/register?competition=${reg.competitionId}`} className="font-semibold text-bad hover:underline">
                    修改後重新送出 →
                  </Link>
                </div>
              )}

              {reg.status === "eliminated" && (
                <div className="mb-3 flex items-center gap-2.5 rounded-[11px] border border-bad/30 bg-bad/8 px-4 py-2.75 text-[12.5px] text-bad">
                  <Icon name="alert" size={15} />
                  你已於「{reg.eliminatedRoundName ?? "某輪"}」遭淘汰 — 後續輪次僅保留投票資格，無法再投稿
                </div>
              )}

              {compRounds.length === 0 ? null : (
                compRounds.map((round) => {
                  const sub = submissionByKey.get(`${round.id}:${reg.id}`);
                  const meta = sub ? SUBMISSION_STATE_META[sub.status] : null;
                  const votingNotOpen = !round.votingOpensAt || new Date(round.votingOpensAt) > new Date();
                  const canDelete = !!sub && votingNotOpen;

                  return (
                    <div key={round.id} className="glass mb-2 px-4.5 py-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 text-[13.5px]">
                          {round.name}
                          {sub?.title && <span className="ml-2 text-ink-dim">— {sub.title}</span>}
                        </div>
                        <div className="text-[11.5px] text-ink-faint">
                          {!sub && !round.allowsNewSubmissions ? "本輪未開放投稿" : " "}
                        </div>
                        {meta ? (
                          <span
                            className={`inline-flex items-center gap-1.25 rounded-full border px-2.5 py-1 text-[11px] ${STATE_PILL_CLASS[meta.cls]}`}
                          >
                            {meta.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.25 rounded-full border border-panel-border px-2.5 py-1 text-[11px] text-ink-faint">
                            尚未投稿
                          </span>
                        )}
                      </div>
                      {sub && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-panel-border pt-2 text-[11.5px] text-ink-faint">
                          <button
                            onClick={() => setPlayingId(sub.id)}
                            className="focus-ring flex items-center gap-1 text-accent hover:underline"
                          >
                            <Icon name={playingId === sub.id ? "pause" : "play"} size={11} /> 播放
                          </button>
                          <a
                            href={sub.sunoShareUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-accent hover:underline"
                          >
                            在 Suno 上查看 <Icon name="externalLink" size={11} />
                          </a>
                          {sub.status === "rejected" && sub.reviewNote && (
                            <span className="text-bad">・退回原因：{sub.reviewNote}</span>
                          )}
                          {canDelete && (
                            <div className="ml-auto flex items-center gap-2">
                              {confirmDeleteId === sub.id ? (
                                <>
                                  <span className="text-bad">確定刪除？</span>
                                  <button
                                    onClick={() => handleDelete(sub.id)}
                                    disabled={deletingId === sub.id}
                                    className="rounded-[8px] border border-bad/35 bg-bad/8 px-2.5 py-1 text-bad disabled:opacity-45"
                                  >
                                    {deletingId === sub.id ? "刪除中…" : "確定"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={deletingId === sub.id}
                                    className="rounded-[8px] border border-panel-border px-2.5 py-1 text-ink-dim"
                                  >
                                    取消
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(sub.id)}
                                  className="rounded-[8px] border border-panel-border px-2.5 py-1 text-ink-dim hover:border-bad/40 hover:text-bad"
                                >
                                  刪除並重新投稿
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {sub && sub.status === "approved" && (
                        <CommentsPanel submissionId={sub.id} canComment={false} canEndorse={true} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })
      )}
      {playing && (
        <PlayerBar key={playing.id} submissionId={playing.id} title={playing.title ?? "未命名作品"} fallbackUrl={playing.sunoShareUrl} />
      )}
    </div>
  );
}
