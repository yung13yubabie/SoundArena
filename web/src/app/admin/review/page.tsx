"use client";

import { useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/lib/icons";
import { MOCK_COMPETITION, MOCK_REVIEW_QUEUE, SUBMISSION_STATE_META, STATE_PILL_CLASS, type SubmissionState } from "@/lib/mockData";

export default function AdminReviewPage() {
  const [rows, setRows] = useState(MOCK_REVIEW_QUEUE);
  const [showEmpty, setShowEmpty] = useState(false);
  const act = (id: number, state: SubmissionState) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, state } : r)));

  return (
    <AdminShell active="review">
      <div className="mb-7">
        <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 審核後台</div>
        <h1 className="font-display text-[30px]">投稿審核清單 — {MOCK_COMPETITION.name}</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          身份比對結果由系統自動判定；不公開設定需人工開啟作者主頁核對；身份比對不通過時保留「人工放行」入口，對應
          Submission 狀態機裡的管理員覆寫分支。
        </p>
      </div>
      <div className="mb-3.5 flex justify-end">
        <button
          onClick={() => setShowEmpty(!showEmpty)}
          className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink"
        >
          {showEmpty ? "顯示範例資料" : "檢視空狀態"}
        </button>
      </div>

      {showEmpty ? (
        <EmptyState icon="inbox" title="目前沒有待審核的投稿" sub="投稿者送出投稿並通過身份比對後，會出現在這個清單" />
      ) : (
        <div>
          <div className="grid grid-cols-[1fr_140px_160px_220px] gap-4 px-4 py-3.5 text-[11px] tracking-wide text-ink-faint uppercase">
            <div>投稿</div>
            <div>身份比對</div>
            <div>不公開檢查</div>
            <div className="text-right">操作</div>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="glass mb-1.5 grid grid-cols-[1fr_140px_160px_220px] items-center gap-4 px-4 py-3.5">
              <div className="text-[13px]">
                {r.track}
                <div className="text-[11px] text-ink-faint">
                  {r.nickname} · Suno @{r.handle}
                </div>
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
              <div>
                {r.unlistedOk === true && (
                  <span className="rounded-full border border-ok/35 bg-ok/8 px-2.25 py-0.75 text-[11px] text-ok">未列於公開頁</span>
                )}
                {r.unlistedOk === false && (
                  <span className="rounded-full border border-bad/35 bg-bad/8 px-2.25 py-0.75 text-[11px] text-bad">仍列於公開頁</span>
                )}
                {r.unlistedOk === null && (
                  <span className="rounded-full border border-panel-border px-2.25 py-0.75 text-[11px] text-ink-dim">待人工開啟核對</span>
                )}
              </div>
              <div className="flex justify-end gap-1.5">
                {r.state === "identity_mismatched" ? (
                  <>
                    <button
                      onClick={() => act(r.id, "rejected")}
                      className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink"
                    >
                      打回重投
                    </button>
                    <button
                      onClick={() => act(r.id, "pending_review")}
                      className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3 py-1.5 text-[11.5px] font-semibold text-[#1a0e08]"
                    >
                      人工放行
                    </button>
                  </>
                ) : r.state === "pending_review" ? (
                  <>
                    <button
                      onClick={() => act(r.id, "rejected")}
                      className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink"
                    >
                      退回
                    </button>
                    <button
                      onClick={() => act(r.id, "approved")}
                      className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3 py-1.5 text-[11.5px] font-semibold text-[#1a0e08]"
                    >
                      通過
                    </button>
                  </>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.25 rounded-full border px-2.5 py-1 text-[11px] ${STATE_PILL_CLASS[SUBMISSION_STATE_META[r.state].cls]}`}
                  >
                    {SUBMISSION_STATE_META[r.state].label}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
