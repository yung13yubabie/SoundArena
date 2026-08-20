import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/lib/icons";
import { CommentsPanel } from "@/components/CommentsPanel";
import { SUBMISSION_STATE_META, STATE_PILL_CLASS, type SubmissionState } from "@/lib/mockData";
import { PrivacyPanel, type PrivacyRegistration, type PrivacySubmission } from "./PrivacyPanel";
import { NotificationToggle } from "./NotificationToggle";
import { DisplayNameEditor } from "./DisplayNameEditor";

interface RegistrationRow {
  id: string;
  status: "active" | "eliminated";
  eliminated_in_round_id: string | null;
  competition_id: string;
  is_public: boolean;
  notifications_enabled: boolean;
  review_status: "pending_review" | "approved" | "rejected";
  review_note: string | null;
  competitions: { name: string } | { name: string }[] | null;
}

interface NotificationEventRow {
  id: string;
  title: string;
  body: string;
  status: "pending" | "sent" | "failed" | "skipped";
  channel: "email" | "discord";
  created_at: string;
}

const NOTIFICATION_STATUS_LABEL: Record<NotificationEventRow["status"], string> = {
  pending: "待送出",
  sent: "已送出",
  failed: "送出失敗",
  skipped: "已略過",
};

interface RoundRow {
  id: string;
  name: string;
  round_index: number;
  competition_id: string;
  allows_new_submissions: boolean;
}

interface SubmissionRow {
  round_id: string;
  registration_id: string;
  status: SubmissionState;
  title: string | null;
  suno_share_url: string;
  review_note: string | null;
  allow_public_playback: boolean;
  id: string;
}

function oneName(value: { name: string } | { name: string }[] | null): string {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? "未命名比賽";
}

export default async function StatusPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();

  const { data: registrations } = await supabase
    .from("registrations")
    .select(
      "id, status, eliminated_in_round_id, competition_id, is_public, notifications_enabled, review_status, review_note, competitions(name)",
    )
    .eq("user_id", userId);

  const { data: notificationEvents } = await supabase
    .from("notification_events")
    .select("id, title, body, status, channel, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const regs = (registrations ?? []) as unknown as RegistrationRow[];
  const competitionIds = regs.map((r) => r.competition_id);

  const { data: rounds } = competitionIds.length
    ? await supabase
        .from("rounds")
        .select("id, name, round_index, competition_id, allows_new_submissions")
        .in("competition_id", competitionIds)
        .order("round_index")
    : { data: [] as RoundRow[] };

  const { data: submissions } = regs.length
    ? await supabase
        .from("submissions")
        .select("id, round_id, registration_id, status, title, suno_share_url, review_note, allow_public_playback")
        .in(
          "registration_id",
          regs.map((r) => r.id),
        )
    : { data: [] as SubmissionRow[] };

  const subs = (submissions ?? []) as unknown as SubmissionRow[];
  const submissionByKey = new Map(subs.map((s) => [`${s.round_id}:${s.registration_id}`, s]));

  return (
    <div>
      <SiteHeader authed active="status" />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7">
          <h1 className="font-display text-[30px]">我的投稿</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            查看你在每場比賽、每一輪的投稿進度。已被淘汰的話，後續輪次只能投票，不能再投稿。
          </p>
          <div className="mt-2.5">
            <DisplayNameEditor initialName={profile?.display_name ?? "（尚未設定名稱）"} />
          </div>
        </div>

        {regs.length === 0 ? (
          <EmptyState icon="inbox" title="你還沒有報名任何比賽" sub="先去活動頁報名一場比賽，這裡就會出現投稿進度" />
        ) : (
          regs.map((reg) => {
            const eliminatedRound = reg.eliminated_in_round_id
              ? (rounds ?? []).find((r) => r.id === reg.eliminated_in_round_id)
              : null;
            const compRounds = (rounds ?? []).filter((r) => r.competition_id === reg.competition_id);

            return (
              <div key={reg.id} className="mb-7">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[16px] font-semibold">{oneName(reg.competitions)}</h2>
                  <NotificationToggle registrationId={reg.id} initialEnabled={reg.notifications_enabled} />
                </div>

                {reg.review_status === "pending_review" && (
                  <div className="mb-3 flex items-center gap-2.5 rounded-[11px] border border-warn/30 bg-warn/8 px-4 py-2.75 text-[12.5px] text-warn">
                    <Icon name="alert" size={15} />
                    報名審核中，主辦人審核通過後才能投稿
                  </div>
                )}
                {reg.review_status === "rejected" && (
                  <div className="mb-3 flex items-center gap-2.5 rounded-[11px] border border-bad/30 bg-bad/8 px-4 py-2.75 text-[12.5px] text-bad">
                    <Icon name="alert" size={15} />
                    <span className="flex-1">
                      報名被退回：{reg.review_note || "（主辦人沒有留下原因）"}
                    </span>
                    <Link href={`/register?competition=${reg.competition_id}`} className="font-semibold text-bad hover:underline">
                      修改後重新送出 →
                    </Link>
                  </div>
                )}

                {reg.status === "eliminated" && (
                  <div className="mb-3 flex items-center gap-2.5 rounded-[11px] border border-bad/30 bg-bad/8 px-4 py-2.75 text-[12.5px] text-bad">
                    <Icon name="alert" size={15} />
                    你已於「{eliminatedRound?.name ?? "某輪"}」遭淘汰 — 後續輪次僅保留投票資格，無法再投稿
                  </div>
                )}

                {compRounds.length === 0 ? (
                  <EmptyState icon="inbox" title="這場比賽還沒有任何輪次" sub="等主辦方設定賽制後再回來看看" />
                ) : (
                  compRounds.map((round) => {
                    const sub = submissionByKey.get(`${round.id}:${reg.id}`);
                    const meta = sub ? SUBMISSION_STATE_META[sub.status] : null;
                    return (
                      <div key={round.id} className="glass mb-2 px-4.5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-1 text-[13.5px]">
                            {round.name}
                            {sub?.title && <span className="ml-2 text-ink-dim">— {sub.title}</span>}
                          </div>
                          <div className="text-[11.5px] text-ink-faint">
                            {!sub && !round.allows_new_submissions ? "本輪未開放投稿" : " "}
                          </div>
                          {meta ? (
                            <span
                              className={`inline-flex items-center gap-1.25 rounded-full border px-2.5 py-1 text-[11px] ${STATE_PILL_CLASS[meta.cls]}`}
                            >
                              {meta.label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.25 rounded-full border border-panel-border px-2.5 py-1 text-[11px] text-ink-faint">
                              尚未投稿
                            </span>
                          )}
                        </div>
                        {sub && (
                          <div className="mt-2 flex items-center gap-2 border-t border-panel-border pt-2 text-[11.5px] text-ink-faint">
                            <a
                              href={sub.suno_share_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-accent hover:underline"
                            >
                              在 Suno 上查看 <Icon name="externalLink" size={11} />
                            </a>
                            {sub.status === "rejected" && sub.review_note && (
                              <span className="text-bad">・退回原因：{sub.review_note}</span>
                            )}
                          </div>
                        )}
                        {sub && sub.status === "approved" && (
                          <CommentsPanel submissionId={sub.id} canComment={false} canEndorse={true} />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })
        )}

        {regs.length > 0 && (notificationEvents ?? []).length > 0 && (
          <div className="mt-10 border-t border-panel-border pt-7">
            <h2 className="mb-1 text-[16px] font-semibold">通知</h2>
            <p className="mb-4 text-[12px] text-ink-dim">
              每張報名上方可以個別開關要不要接收該場比賽的通知。實際寄信/Discord 私訊尚未接上外部服務，「待送出」是誠實的現況，不是卡住了。
            </p>
            <div className="flex flex-col gap-2">
              {((notificationEvents ?? []) as unknown as NotificationEventRow[]).map((n) => (
                <div key={n.id} className="glass flex items-start justify-between gap-4 px-4 py-3">
                  <div>
                    <div className="text-[13px] font-semibold">{n.title}</div>
                    <div className="text-[12px] text-ink-dim">{n.body}</div>
                  </div>
                  <span className="flex-none rounded-full border border-panel-border px-2.25 py-0.75 text-[11px] text-ink-faint">
                    {NOTIFICATION_STATUS_LABEL[n.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {regs.length > 0 && (
          <div className="mt-10 border-t border-panel-border pt-7">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-semibold">隱私設定</h2>
                <p className="mt-1 text-[12px] text-ink-dim">
                  選擇哪些報名紀錄、哪些投稿作品要出現在你的
                  <Link href={`/u/${userId}`} className="mx-1 text-accent hover:underline">
                    公開檔案
                  </Link>
                  上，可以個別設定，也可以一次全部切換。
                </p>
              </div>
            </div>
            <PrivacyPanel
              registrations={regs.map((r): PrivacyRegistration => ({
                id: r.id,
                competitionName: oneName(r.competitions),
                isPublic: r.is_public,
              }))}
              submissions={subs
                .filter((s) => s.title)
                .map((s): PrivacySubmission => ({ id: s.id, title: s.title as string, isPublic: s.allow_public_playback }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
