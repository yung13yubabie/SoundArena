"use client";

import { useState, useTransition } from "react";
import { reviewRegistration } from "./actions";

export interface PendingRegistration {
  id: string;
  displayName: string;
  sunoHandle: string;
}

export function RegistrationReviewQueue({ rows }: { rows: PendingRegistration[] }) {
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const act = (id: string, decision: "approved" | "rejected", reason?: string) => {
    startTransition(() => {
      reviewRegistration(id, decision, reason);
    });
    setRejectingId(null);
    setNote("");
  };

  return (
    <div>
      <div className="hidden grid-cols-[1fr_220px] gap-4 px-4 py-3.5 text-[11px] tracking-wide text-ink-faint uppercase md:grid">
        <div>報名者</div>
        <div className="text-right">操作</div>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="glass mb-1.5 px-4 py-3.5">
          <div className="grid grid-cols-1 items-center gap-2.5 md:grid-cols-[1fr_220px] md:gap-4">
            <div className="text-[13px]">
              {r.displayName}
              <div className="text-[11px] text-ink-faint">Suno @{r.sunoHandle}</div>
            </div>
            <div className="flex justify-end gap-1.5">
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
            </div>
          </div>

          {rejectingId === r.id && (
            <div className="mt-3 flex items-start gap-2.5 border-t border-panel-border pt-3">
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="退回原因（會顯示給報名者看）"
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
