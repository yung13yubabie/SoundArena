"use client";

import { useState } from "react";
import { sendMessageToParticipant } from "./actions";

export interface ParticipantRow {
  registrationId: string;
  displayName: string;
  sunoHandle: string;
  submittedRounds: number;
  totalRounds: number;
}

function MessageComposer({ registrationId, onDone }: { registrationId: string; onDone: () => void }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setSending(true);
    setError(null);
    const result = await sendMessageToParticipant(registrationId, message);
    setSending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="mt-2 flex items-start gap-2">
      <input
        autoFocus
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="輸入要傳給這位參賽者的訊息…"
        className="flex-1 rounded-[10px] border border-panel-border bg-black/25 px-3 py-1.75 text-[12.5px] text-ink outline-none focus:border-accent/50"
      />
      <button
        disabled={sending || message.trim() === ""}
        onClick={handleSend}
        className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3.5 py-1.75 text-[11.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
      >
        {sending ? "傳送中…" : "送出"}
      </button>
      {error && <p className="text-[11.5px] text-bad">{error}</p>}
    </div>
  );
}

export function ParticipantRoster({ rows }: { rows: ParticipantRow[] }) {
  const [composingId, setComposingId] = useState<string | null>(null);
  const [justSentId, setJustSentId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.registrationId} className="glass px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[13px]">{r.displayName}</span>
              <span className="ml-2 text-[11.5px] text-ink-faint">Suno @{r.sunoHandle}</span>
            </div>
            <div className="flex flex-none items-center gap-2.5">
              <span
                className={`rounded-full border px-2.25 py-0.75 text-[11px] ${
                  r.submittedRounds === r.totalRounds
                    ? "border-ok/35 bg-ok/8 text-ok"
                    : "border-warn/35 bg-warn/8 text-warn"
                }`}
              >
                已投稿 {r.submittedRounds}/{r.totalRounds} 輪
              </span>
              <button
                onClick={() => setComposingId(composingId === r.registrationId ? null : r.registrationId)}
                className="rounded-[9px] border border-panel-border bg-white/[0.04] px-3 py-1.25 text-[11.5px] font-semibold text-ink hover:border-accent/40"
              >
                傳訊息
              </button>
            </div>
          </div>
          {composingId === r.registrationId &&
            (justSentId === r.registrationId ? (
              <p className="mt-2 text-[11.5px] text-ok">已送出</p>
            ) : (
              <MessageComposer
                registrationId={r.registrationId}
                onDone={() => {
                  setJustSentId(r.registrationId);
                  setTimeout(() => {
                    setComposingId(null);
                    setJustSentId(null);
                  }, 1500);
                }}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
