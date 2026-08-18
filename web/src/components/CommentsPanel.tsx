"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/lib/icons";
import { fetchSubmissionComments, submitComment, endorseComment, type CommentRow } from "@/lib/commentActions";

interface CommentsPanelProps {
  submissionId: string;
  canComment: boolean;
  canEndorse: boolean;
}

export function CommentsPanel({ submissionId, canComment, canEndorse }: CommentsPanelProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const result = await fetchSubmissionComments(submissionId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setComments(result);
      setLoaded(true);
    });
  }

  function toggle() {
    setOpen((o) => !o);
    if (!loaded) load();
  }

  function send() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      const result = await submitComment(submissionId, body);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDraft("");
      load();
    });
  }

  function endorse(commentId: string, percent: number) {
    setError(null);
    startTransition(async () => {
      const result = await endorseComment(commentId, percent);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      load();
    });
  }

  return (
    <div className="mt-3 border-t border-panel-border pt-3">
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-[12px] text-ink-dim transition-colors hover:text-ink"
      >
        <Icon name="comment" size={13} />
        {open ? "收合留言" : loaded ? `留言（${comments.length}）` : "查看留言"}
      </button>

      {open && (
        <div className="mt-2.5 space-y-2.5">
          {error && <p className="rounded-[9px] border border-bad/30 bg-bad/10 p-2 text-[11.5px] text-bad">{error}</p>}

          {!loaded && isPending ? (
            <p className="text-[12px] text-ink-faint">載入中…</p>
          ) : comments.length === 0 ? (
            <p className="text-[12px] text-ink-faint">還沒有留言。</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-[9px] border border-panel-border bg-black/15 p-2.5">
                <div className="mb-1 flex items-center justify-between text-[11px] text-ink-faint">
                  <span>{c.isOwnComment ? "你" : (c.commenterDisplayName ?? "匿名（尚未揭露身份）")}</span>
                  {c.endorsedAt && <span className="text-ok">已認可 {c.endorsementPercent}%</span>}
                </div>
                <div className="text-[13px] text-ink">{c.body}</div>
                {canEndorse && !c.endorsedAt && (
                  <EndorseControl disabled={isPending} onConfirm={(pct) => endorse(c.id, pct)} />
                )}
              </div>
            ))
          )}

          {canComment && (
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="寫下你的留言…"
                className="flex-1 rounded-[9px] border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink outline-none focus:border-accent/50"
              />
              <button
                onClick={send}
                disabled={isPending || !draft.trim()}
                className="rounded-[9px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3 py-2 text-[12px] font-semibold text-[#1a0e08] transition-opacity disabled:opacity-45"
              >
                送出
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EndorseControl({ onConfirm, disabled }: { onConfirm: (percent: number) => void; disabled: boolean }) {
  const [percent, setPercent] = useState(100);
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        onChange={(e) => setPercent(Number(e.target.value))}
        className="h-1 flex-1 accent-accent"
      />
      <span className="w-9 text-right text-[11.5px] text-ink-dim">{percent}%</span>
      <button
        onClick={() => onConfirm(percent)}
        disabled={disabled}
        className="rounded-[8px] border border-ok/35 bg-ok/8 px-2.5 py-1 text-[11px] text-ok transition-colors hover:bg-ok/15 disabled:opacity-45"
      >
        認可
      </button>
    </div>
  );
}
