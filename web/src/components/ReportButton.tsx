"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";

interface ReportButtonProps {
  target: string;
}

export function ReportButton({ target }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="mt-0.5 flex w-fit items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-3 text-[12.5px] text-ok">
        <Icon name="check" size={13} />
        檢舉已送出，PlatformAdmin 會盡快處理
      </div>
    );
  }

  return (
    <div className="mt-0.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
      >
        <Icon name="alert" size={13} />
        檢舉此比賽
      </button>
      {open && (
        <div className="glass mt-2 max-w-[420px] p-3.5">
          <label className="mb-1.5 block text-[11.5px] text-ink-dim">
            檢舉「{target}」— 檢舉對象是整場比賽，不是個別投稿
          </label>
          <textarea
            className="min-h-17.5 w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
            placeholder="請描述具體情況"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink"
            >
              取消
            </button>
            <button
              disabled={!reason.trim()}
              onClick={() => setSent(true)}
              className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3 py-1.5 text-[11.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
            >
              送出檢舉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
