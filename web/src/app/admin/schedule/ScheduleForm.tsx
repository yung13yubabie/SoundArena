"use client";

import { useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { Icon } from "@/lib/icons";
import { saveSchedule, type ScheduleInput } from "./actions";

type Dates = Omit<ScheduleInput, "competitionId" | "roundIds">

interface ScheduleFormProps {
  competitionId: string;
  competitionName: string;
  roundIds: string[];
  initial: Dates;
  competitionList: Array<{ id: string; name: string }>;
  isPlatformAdmin?: boolean;
}

const PHASE_FIELDS: Array<{ label: string; startKey: keyof Dates; endKey: keyof Dates }> = [
  { label: "宣傳期", startKey: "promotionStart", endKey: "promotionEnd" },
  { label: "投稿期", startKey: "submissionStart", endKey: "submissionEnd" },
  { label: "投票期", startKey: "votingStart", endKey: "votingEnd" },
  { label: "公布期", startKey: "announcementStart", endKey: "announcementEnd" },
];

function buildShareMessage(competitionName: string, competitionId: string, dates: Dates, origin: string): string {
  const show = (v: string) => v || "（尚未設定）";
  return [
    `${competitionName} 開放報名中`,
    "",
    `報名連結：${origin}/register?competition=${competitionId}`,
    `報名截止：${show(dates.registrationDeadline)}`,
    `投稿截止：${show(dates.submissionEnd)}`,
    `投票開始：${show(dates.votingStart)}`,
    "",
    `賽制與作品試聽：${origin}/competitions?competition=${competitionId}`,
  ].join("\n");
}

function ShareMessagePanel({
  competitionId,
  competitionName,
  dates,
}: {
  competitionId: string;
  competitionName: string;
  dates: Dates;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const message = buildShareMessage(competitionName, competitionId, dates, origin);

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="glass mt-6 p-5">
      <div className="mb-1.5 text-[13.5px] font-semibold">分享文字</div>
      <p className="mb-3 text-[11.5px] text-ink-dim">
        整合報名連結與目前設定的時程，可以直接複製貼到 LINE / Discord 群組公告。內容會隨上面的時程設定即時更新。
      </p>
      <pre className="mb-3 whitespace-pre-wrap rounded-[10px] border border-panel-border bg-black/25 p-3.5 text-[12.5px] text-ink">
        {message}
      </pre>
      <button
        onClick={handleCopy}
        className="rounded-[10px] border border-panel-border bg-white/[0.04] px-4 py-2 text-[12.5px] font-semibold text-ink"
      >
        {copied ? "已複製" : "複製文字"}
      </button>
    </div>
  );
}

export function ScheduleForm({
  competitionId,
  competitionName,
  roundIds,
  initial,
  competitionList,
  isPlatformAdmin = false,
}: ScheduleFormProps) {
  const [dates, setDates] = useState<Dates>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof Dates, value: string) => {
    setDates((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  const registerAfterSubmitEnd =
    dates.registrationDeadline && dates.submissionEnd && dates.registrationDeadline > dates.submissionEnd;
  const submitAfterVoteStart =
    dates.submissionEnd && dates.votingStart && dates.submissionEnd > dates.votingStart;
  const hasError = !!registerAfterSubmitEnd || !!submitAfterVoteStart;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await saveSchedule({ competitionId, roundIds, ...dates });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setSaved(true);
    }
  }

  return (
    <AdminShell
      active="schedule"
      competitions={competitionList}
      activeCompetitionId={competitionId}
      isPlatformAdmin={isPlatformAdmin}
    >
      <div className="mb-7">
        <h1 className="font-display text-[30px]">賽事時程 — {competitionName}</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          設定宣傳、投稿、投票、公布四個階段的起訖日期，時間衝突會立即提示。投稿／投票期會套用到目前每一輪。
        </p>
      </div>

      <div className="glass px-5 py-2">
        {PHASE_FIELDS.map((p) => (
          <div
            key={p.label}
            className="grid grid-cols-[140px_1fr_1fr] items-center gap-4 border-b border-panel-border py-3.5 last:border-b-0"
          >
            <div className="text-[13.5px] font-semibold">{p.label}</div>
            <div>
              <label className="mb-1.25 block text-[10.5px] tracking-wide text-ink-faint uppercase">開始</label>
              <input
                type="date"
                value={dates[p.startKey]}
                onChange={(e) => set(p.startKey, e.target.value)}
                className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="mb-1.25 block text-[10.5px] tracking-wide text-ink-faint uppercase">結束</label>
              <input
                type="date"
                value={dates[p.endKey]}
                onChange={(e) => set(p.endKey, e.target.value)}
                className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
              />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[140px_1fr_1fr] items-center gap-4 py-3.5">
          <div className="text-[13.5px] font-semibold">報名截止</div>
          <div>
            <label className="mb-1.25 block text-[10.5px] tracking-wide text-ink-faint uppercase">最晚報名日</label>
            <input
              type="date"
              value={dates.registrationDeadline}
              onChange={(e) => set("registrationDeadline", e.target.value)}
              className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
            />
          </div>
          <div />
        </div>

        {registerAfterSubmitEnd && (
          <div className="col-span-full mt-1.5 mb-3 flex items-center gap-2 rounded-lg border border-bad/30 bg-bad/8 px-3 py-2 text-[11.5px] text-bad">
            <Icon name="alert" size={14} /> 報名截止日（{dates.registrationDeadline}）晚於投稿期結束（{dates.submissionEnd}）— 違反第 2 節「存取順序」規則，請調整
          </div>
        )}
        {submitAfterVoteStart && (
          <div className="col-span-full mt-1.5 mb-3 flex items-center gap-2 rounded-lg border border-bad/30 bg-bad/8 px-3 py-2 text-[11.5px] text-bad">
            <Icon name="alert" size={14} /> 投稿期結束（{dates.submissionEnd}）晚於投票期開始（{dates.votingStart}）— 兩階段時間重疊，請調整
          </div>
        )}
        {error && <p className="col-span-full mt-1.5 mb-3 text-[12px] text-bad">儲存失敗：{error}</p>}

        <div className="col-span-full py-3.5">
          <button
            onClick={handleSave}
            disabled={saving || hasError}
            className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
          >
            {saving ? "儲存中…" : saved ? "已儲存" : "儲存時程"}
          </button>
        </div>
      </div>

      <ShareMessagePanel competitionId={competitionId} competitionName={competitionName} dates={dates} />
    </AdminShell>
  );
}
