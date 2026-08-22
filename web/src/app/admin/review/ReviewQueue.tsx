"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/lib/icons";
import { SUBMISSION_STATE_META, STATE_PILL_CLASS } from "@/lib/submissionStateMeta";
import { reviewSubmission } from "./actions";

export interface ReviewRow {
  id: string;
  title: string;
  nickname: string;
  handle: string;
  identityMatch: "match" | "mismatch";
  status: "pending_review" | "identity_mismatched" | "approved" | "rejected";
  reviewNote: string | null;
}

export function ReviewQueue({ rows }: { rows: ReviewRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const act = (id: string, status: "approved" | "rejected" | "pending_review", reason?: string) => {
    startTransition(() => {
      reviewSubmission(id, status, reason);
    });
    setRejectingId(null);
    setNote("");
  };

  return (
    <div>
      <div className="hidden grid-cols-[1fr_140px_220px] gap-4 px-4 py-3.5 text-[11px] tracking-wide text-ink-faint uppercase md:grid">
        <div>投稿</div>
        <div>身份比對</div>
        <div className="text-right">操作</div>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="glass mb-1.5 px-4 py-3.5">
          <div className="grid grid-cols-1 items-start gap-2.5 md:grid-cols-[1fr_140px_220px] md:items-center md:gap-4">
            <div className="text-[13px]">
              {r.title}
              <div className="text-[11px] text-ink-faint">
                {r.nickname} · Suno @{r.handle}
              </div>
              {r.status === "rejected" && r.reviewNote && (
                <div className="mt-1 text-[11px] text-bad">退回原因：{r.reviewNote}</div>
              )}
            </div>
            <div>
              {r.identityMatch === "match" ? (
                <span className="flex w-fit items-center gap-1 rounded-full border border-ok/35 bg-ok/8 px-2.25 py-0.75 text-[11px] text-ok">
                  <Icon name="check" size={11} /> 比對通過
                </span>
              ) : (
                <span className="flex w-fit items-center gap-1 rounded-full border border-bad/35 bg-bad/8 px-2.25 py-0.75 text-[11px] text-bad">
                  <Icon name="alert" size={11} /> 比對不通過
                </span>
              )}
            </div>
            <div className="flex justify-end gap-1.5">
              {r.status === "identity_mismatched" ? (
                <>
                  <button
                    disabled={isPending}
                    onClick={() => {
                      setRejectingId(r.id);
                      setNote("");
                    }}
                    className="focus-ring rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink transition-colors hover:border-accent/40 disabled:opacity-45"
                  >
                    打回重投
                  </button>
                  <button
                    disabled={isPending}
                    onClick={() => act(r.id, "pending_review")}
                    className="focus-ring rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3 py-1.5 text-[11.5px] font-semibold text-[#1a0e08] transition hover:brightness-110 disabled:opacity-45"
                  >
                    人工放行
                  </button>
                </>
              ) : r.status === "pending_review" ? (
                <>
                  <button
                    disabled={isPending}
                    onClick={() => {
                      setRejectingId(r.id);
                      setNote("");
                    }}
                    className="focus-ring rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink transition-colors hover:border-accent/40 disabled:opacity-45"
                  >
                    退回
                  </button>
                  <button
                    disabled={isPending}
                    onClick={() => act(r.id, "approved")}
                    className="focus-ring rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3 py-1.5 text-[11.5px] font-semibold text-[#1a0e08] transition hover:brightness-110 disabled:opacity-45"
                  >
                    通過
                  </button>
                </>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.25 rounded-full border px-2.5 py-1 text-[11px] ${STATE_PILL_CLASS[SUBMISSION_STATE_META[r.status].cls]}`}
                >
                  {SUBMISSION_STATE_META[r.status].label}
                </span>
              )}
            </div>
          </div>

          {rejectingId === r.id && (
            <div className="mt-3 flex items-start gap-2.5 border-t border-panel-border pt-3">
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="退回原因（會顯示給投稿者看，選填）"
                className="flex-1 rounded-[10px] border border-panel-border bg-black/25 px-3 py-1.75 text-[12.5px] text-ink outline-none focus:border-accent/50"
              />
              <button
                disabled={isPending}
                onClick={() => setRejectingId(null)}
                className="focus-ring rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.75 text-[11.5px] text-ink-dim transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-45"
              >
                取消
              </button>
              <button
                disabled={isPending}
                onClick={() => act(r.id, "rejected", note)}
                className="focus-ring rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3 py-1.75 text-[11.5px] font-semibold text-[#1a0e08] transition hover:brightness-110 disabled:opacity-45"
              >
                確認退回
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
