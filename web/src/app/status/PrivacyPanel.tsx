"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/Switch";
import { setRegistrationPublic, setSubmissionPublic, setAllPublic } from "./actions";

export interface PrivacyRegistration {
  id: string;
  competitionName: string;
  isPublic: boolean;
}

export interface PrivacySubmission {
  id: string;
  title: string;
  isPublic: boolean;
}

export function PrivacyPanel({
  registrations,
  submissions,
}: {
  registrations: PrivacyRegistration[];
  submissions: PrivacySubmission[];
}) {
  const [regs, setRegs] = useState(registrations);
  const [subs, setSubs] = useState(submissions);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleReg = (id: string, next: boolean) => {
    setError(null);
    setRegs((rs) => rs.map((r) => (r.id === id ? { ...r, isPublic: next } : r)));
    startTransition(async () => {
      const result = await setRegistrationPublic(id, next);
      if ("error" in result) {
        setError(result.error);
        setRegs((rs) => rs.map((r) => (r.id === id ? { ...r, isPublic: !next } : r)));
      }
    });
  };
  const toggleSub = (id: string, next: boolean) => {
    setError(null);
    setSubs((ss) => ss.map((s) => (s.id === id ? { ...s, isPublic: next } : s)));
    startTransition(async () => {
      const result = await setSubmissionPublic(id, next);
      if ("error" in result) {
        setError(result.error);
        setSubs((ss) => ss.map((s) => (s.id === id ? { ...s, isPublic: !next } : s)));
      }
    });
  };
  const bulkSet = (next: boolean) => {
    setError(null);
    const prevRegs = regs;
    const prevSubs = subs;
    setRegs((rs) => rs.map((r) => ({ ...r, isPublic: next })));
    setSubs((ss) => ss.map((s) => ({ ...s, isPublic: next })));
    startTransition(async () => {
      const result = await setAllPublic(
        prevRegs.map((r) => r.id),
        prevSubs.map((s) => s.id),
        next,
      );
      if ("error" in result) {
        setError(result.error);
        setRegs(prevRegs);
        setSubs(prevSubs);
      }
    });
  };

  return (
    <div className="glass p-5">
      {error && (
        <p className="mb-3.5 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>
      )}
      <div className="mb-3.5 flex gap-2">
        <button
          disabled={isPending}
          onClick={() => bulkSet(true)}
          className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink disabled:opacity-45"
        >
          全部公開
        </button>
        <button
          disabled={isPending}
          onClick={() => bulkSet(false)}
          className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink disabled:opacity-45"
        >
          全部私密
        </button>
      </div>

      <div className="mb-2 text-[11px] tracking-wide text-ink-faint uppercase">參賽紀錄</div>
      {regs.map((r) => (
        <div key={r.id} className="flex items-center justify-between border-b border-panel-border py-2.5 last:border-b-0">
          <span className="text-[12.5px]">{r.competitionName}</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-faint">{r.isPublic ? "公開" : "不公開"}</span>
            <Switch on={r.isPublic} label={`「${r.competitionName}」報名資訊是否公開`} onClick={() => toggleReg(r.id, !r.isPublic)} />
          </div>
        </div>
      ))}

      {subs.length > 0 && (
        <>
          <div className="mt-4 mb-2 text-[11px] tracking-wide text-ink-faint uppercase">投稿作品試聽</div>
          {subs.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-b border-panel-border py-2.5 last:border-b-0">
              <span className="text-[12.5px]">{s.title}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-faint">{s.isPublic ? "公開" : "不公開"}</span>
                <Switch on={s.isPublic} label={`「${s.title}」是否公開試聽`} onClick={() => toggleSub(s.id, !s.isPublic)} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
