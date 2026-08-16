"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";

export function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStatus("error");
      setError("登入狀態已過期，請重新登入");
      return;
    }

    const { error: insertError } = await supabase
      .from("feedback")
      .insert({ user_id: user.id, message: message.trim() });

    if (insertError) {
      setStatus("error");
      setError(insertError.message);
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div>
        <SiteHeader authed />
        <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
          <h1 className="font-display text-[30px]">意見回饋</h1>
          <div className="glass mt-7 max-w-[560px] p-7">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-3.5 text-[12.5px] text-ok">
              <Icon name="check" />
              已收到你的回饋，謝謝
            </div>
            <button
              className="mt-3.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-4.5 py-2.5 text-[13.5px] font-semibold text-ink"
              onClick={() => {
                setMessage("");
                setStatus("idle");
              }}
            >
              再寫一則
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SiteHeader authed />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">意見回饋</div>
          <h1 className="font-display text-[30px]">告訴我們你的想法</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            功能建議、bug、任何想說的都可以寫在這裡。
          </p>
        </div>

        <div className="glass max-w-[560px] p-7">
          <textarea
            className="min-h-40 w-full resize-y rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none focus:border-accent/50"
            placeholder="想說什麼都可以"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          {status === "error" && (
            <p className="mt-2.5 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">
              送出失敗：{error}
            </p>
          )}

          <button
            className="mt-3.5 rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
            disabled={!message.trim() || status === "sending"}
            onClick={handleSubmit}
          >
            {status === "sending" ? "送出中…" : "送出"}
          </button>
        </div>
      </div>
    </div>
  );
}
