"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { registerForCompetition, resubmitRegistration } from "./actions";

type ReviewStatus = "pending_review" | "approved" | "rejected";

interface ExistingRegistration {
  id: string;
  display_name: string;
  suno_handle: string;
  review_status: ReviewStatus;
  review_note: string | null;
}

interface RegisterFormProps {
  competitionId: string;
  competitionName: string;
  existing: ExistingRegistration | null;
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

  if (existing?.review_status === "rejected") {
    return (
      <ResubmitForm
        registrationId={existing.id}
        competitionName={competitionName}
        reviewNote={existing.review_note}
        initialNickname={existing.display_name}
        initialSunoHandle={existing.suno_handle}
      />
    );
  }

  if (existing?.review_status === "approved") {
    return (
      <div>
        <SiteHeader authed active="events" />
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <h1 className="font-display text-[30px]">報名完成</h1>
          <div className="glass mt-7 max-w-[560px] p-7">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-3.5 text-[12.5px] text-ok">
              <Icon name="check" />
              已報名「{existing.display_name}」，Suno 帳號 {existing.suno_handle} 已登記
            </div>
            <Link
              href="/submit"
              className="mt-3.5 inline-block rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08]"
            >
              前往投稿頁提交作品 →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (existing?.review_status === "pending_review" || submitted) {
    const shown = existing ?? { display_name: nickname, suno_handle: sunoHandle };
    return (
      <div>
        <SiteHeader authed active="events" />
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <h1 className="font-display text-[30px]">報名審核中</h1>
          <div className="glass mt-7 max-w-[560px] p-7">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-warn/30 bg-warn/10 p-3.5 text-[12.5px] text-warn">
              <Icon name="alert" />
              已收到「{shown.display_name}」的報名，Suno 帳號 {shown.suno_handle}，等主辦人審核通過後才能投稿
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
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <h1 className="font-display text-[30px]">{competitionName}</h1>
          <div className="glass mt-7 max-w-[560px] p-3.5 text-[12.5px] text-bad">報名已截止，無法再報名這場比賽。</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SiteHeader authed active="events" />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7">
          <h1 className="font-display text-[30px]">報名參賽 — {competitionName}</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            填寫基本資料並提供 Suno 帳號，送出後由主辦人審核，審核通過才能投稿。
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

function ResubmitForm({
  registrationId,
  competitionName,
  reviewNote,
  initialNickname,
  initialSunoHandle,
}: {
  registrationId: string;
  competitionName: string;
  reviewNote: string | null;
  initialNickname: string;
  initialSunoHandle: string;
}) {
  const [nickname, setNickname] = useState(initialNickname);
  const [sunoHandle, setSunoHandle] = useState(initialSunoHandle);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const canSubmit = nickname.trim() !== "" && sunoHandle.trim() !== "";

  async function handleResubmit() {
    setPending(true);
    setError(null);
    const result = await resubmitRegistration(registrationId, nickname, sunoHandle);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setResent(true);
    }
  }

  if (resent) {
    return (
      <div>
        <SiteHeader authed active="events" />
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <h1 className="font-display text-[30px]">報名審核中</h1>
          <div className="glass mt-7 max-w-[560px] p-7">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-warn/30 bg-warn/10 p-3.5 text-[12.5px] text-warn">
              <Icon name="alert" />
              已重新送出，等主辦人再次審核
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SiteHeader authed active="events" />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7">
          <h1 className="font-display text-[30px]">報名被退回 — {competitionName}</h1>
        </div>

        <div className="glass max-w-[560px] p-7">
          <div className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-bad/30 bg-bad/10 p-3.5 text-[12.5px] text-bad">
            <Icon name="alert" className="mt-0.5 flex-none" />
            <span>退回原因：{reviewNote || "（主辦人沒有留下原因）"}</span>
          </div>

          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">參賽者暱稱</label>
          <input
            className="mb-5 w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />

          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">Suno 帳號名稱 或 個人主頁網址</label>
          <input
            className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
            value={sunoHandle}
            onChange={(e) => setSunoHandle(e.target.value)}
          />

          {error && (
            <p className="mt-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>
          )}

          <button
            className="mt-4 w-full rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 py-3 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
            disabled={!canSubmit || pending}
            onClick={handleResubmit}
          >
            {pending ? "送出中…" : "修改後重新送出審核"}
          </button>
        </div>
      </div>
    </div>
  );
}
