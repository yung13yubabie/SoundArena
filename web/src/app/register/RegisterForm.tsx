"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { registerForCompetition } from "./actions";

interface RegisterFormProps {
  competitionId: string;
  competitionName: string;
  existing: { id: string; display_name: string; suno_handle: string } | null;
  registrationClosed: boolean;
}

export function RegisterForm({ competitionId, competitionName, existing, registrationClosed }: RegisterFormProps) {
  const [nickname, setNickname] = useState("");
  const [sunoHandle, setSunoHandle] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canSubmit = nickname.trim() !== "" && sunoHandle.trim() !== "";

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("competition_id", competitionId);
    formData.set("display_name", nickname);
    formData.set("suno_handle", sunoHandle);
    const result = await registerForCompetition(formData);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setSubmitted(true);
    }
  }

  if (existing || submitted) {
    const shown = existing ?? { display_name: nickname, suno_handle: sunoHandle };
    return (
      <div>
        <SiteHeader authed active="events" />
        <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
          <h1 className="font-display text-[30px]">報名完成</h1>
          <div className="glass mt-7 max-w-[560px] p-7">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-3.5 text-[12.5px] text-ok">
              <Icon name="check" />
              已報名「{shown.display_name}」，Suno 帳號 {shown.suno_handle} 已登記，可以前往「投稿」頁提交作品了
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (registrationClosed) {
    return (
      <div>
        <SiteHeader authed active="events" />
        <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
          <h1 className="font-display text-[30px]">{competitionName}</h1>
          <div className="glass mt-7 max-w-[560px] p-3.5 text-[12.5px] text-bad">報名已截止，無法再報名這場比賽。</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SiteHeader authed active="events" />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 報名</div>
          <h1 className="font-display text-[30px]">報名參賽 — {competitionName}</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            填寫基本資料並提供 Suno 帳號，之後每一輪投稿都會用這組帳號核對身份。
          </p>
        </div>

        <div className="glass max-w-[560px] p-7">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">
            參賽者暱稱（比賽公開頁面顯示用，匿名輪次不會顯示）
          </label>
          <input
            className="mb-5 w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
            placeholder="例如：夜遊者"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />

          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">
            Suno 帳號名稱 或 個人主頁網址
          </label>
          <input
            className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
            placeholder="my13u 或 https://suno.com/@my13u"
            value={sunoHandle}
            onChange={(e) => setSunoHandle(e.target.value)}
          />
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
            用於投稿時自動比對「投稿連結的作者」是否為本人 — 沒有這欄，系統無法驗證投稿是否為你自己的作品。
          </p>

          {error && (
            <p className="mt-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>
          )}

          <button
            className="mt-4 w-full rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 py-3 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
            disabled={!canSubmit || pending}
            onClick={handleSubmit}
          >
            {pending ? "送出中…" : "送出報名"}
          </button>
          {!canSubmit && (
            <p className="mt-2 text-[11.5px] text-ink-faint">兩個欄位都填寫後才能送出。</p>
          )}
        </div>
      </div>
    </div>
  );
}
