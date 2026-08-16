import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/lib/icons";
import { MOCK_COMPETITION, MOCK_MY_SUBMISSIONS, SUBMISSION_STATE_META, STATE_PILL_CLASS } from "@/lib/mockData";

// demo：呈現「已淘汰只能投票」的狀態，之後改讀真實 ParticipantStatus
const ELIMINATED = true;

export default function StatusPage() {
  return (
    <div>
      <SiteHeader authed active="status" />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 個人投稿狀態</div>
          <h1 className="font-display text-[30px]">我的投稿 — {MOCK_COMPETITION.name}</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            查看你在這場比賽每一輪的投稿進度。已被淘汰的話，後續輪次只能投票，不能再投稿。
          </p>
        </div>

        {ELIMINATED && (
          <div className="mb-6 flex items-center gap-2.5 rounded-[11px] border border-bad/30 bg-bad/8 px-4 py-2.75 text-[12.5px] text-bad">
            <Icon name="alert" size={15} />
            你已於「第 2 輪 · 複賽」遭淘汰 — 後續輪次僅保留投票資格，無法再投稿
          </div>
        )}

        {MOCK_MY_SUBMISSIONS.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="你在這場比賽還沒有任何投稿紀錄"
            sub="報名後前往「投稿」頁提交作品，這裡就會出現每輪的審核進度"
          />
        ) : (
          MOCK_MY_SUBMISSIONS.map((s, i) => {
            const meta = SUBMISSION_STATE_META[s.state];
            return (
              <div key={i} className="glass mb-2 flex items-center gap-4 px-4.5 py-4">
                <div className="flex-1 text-[13.5px]">{s.round}</div>
                <div className="text-[11.5px] text-ink-faint">
                  {s.locked ? "本輪未開放投稿（已淘汰或輪次未開放）" : " "}
                </div>
                <span
                  className={`inline-flex items-center gap-1.25 rounded-full border px-2.5 py-1 text-[11px] ${STATE_PILL_CLASS[meta.cls]}`}
                >
                  {meta.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
