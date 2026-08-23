"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { Switch } from "@/components/Switch";
import { EmptyState } from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/clientErrorReport";

type Section =
  | "review"
  | "format"
  | "schedule"
  | "profile"
  | "judge"
  | "collaborators"
  | "platform-competitions"
  | "platform-organizers"
  | "platform-feedback";

interface AdminCompetitionOption {
  id: string;
  name: string;
}

interface PlatformCompetitionRow {
  id: string;
  name: string;
  registration_opens_at: string | null;
  organizer: { display_name: string | null } | { display_name: string | null }[] | null;
  rounds: { voting_closes_at: string | null }[];
}

function organizerName(row: PlatformCompetitionRow): string {
  const o = Array.isArray(row.organizer) ? row.organizer[0] : row.organizer;
  return o?.display_name ?? "（未命名）";
}

function competitionStatus(row: PlatformCompetitionRow): "進行中" | "即將開始" | "已結束" {
  const now = Date.now();
  const votingCloseTimes = row.rounds
    .map((r) => r.voting_closes_at)
    .filter((d): d is string => d != null)
    .map((d) => new Date(d).getTime());
  if (votingCloseTimes.length > 0 && Math.max(...votingCloseTimes) < now) return "已結束";
  if (row.registration_opens_at && new Date(row.registration_opens_at).getTime() > now) return "即將開始";
  return "進行中";
}

interface PlatformOrganizerRow {
  id: string;
  display_name: string | null;
  host_revoked_at: string | null;
  host_approved_at: string | null;
}

interface PlatformFeedbackRow {
  id: string;
  message: string;
  created_at: string;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
}

function feedbackAuthorName(row: PlatformFeedbackRow): string {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return p?.display_name ?? "（未命名）";
}

interface AdminShellProps {
  active: "review" | "format" | "schedule" | "profile" | "judge" | "collaborators";
  children: ReactNode;
  competitions?: AdminCompetitionOption[];
  activeCompetitionId?: string;
  // 只有呼叫端查過 profiles.is_platform_admin 為 true,才會顯示 PlatformAdmin 視角切換開關。
  isPlatformAdmin?: boolean;
}

const ORG_ITEMS = [
  { key: "review" as const, label: "審核後台", icon: "shield" as const },
  { key: "format" as const, label: "賽制建立", icon: "crown" as const },
  { key: "schedule" as const, label: "時程設定", icon: "calendar" as const },
  { key: "judge" as const, label: "評審評分", icon: "star" as const },
  { key: "collaborators" as const, label: "協作者管理", icon: "users" as const },
  { key: "profile" as const, label: "主辦人身分", icon: "user" as const },
];

const PLATFORM_ITEMS = [
  { key: "platform-competitions" as const, label: "全站比賽", icon: "inbox" as const },
  { key: "platform-organizers" as const, label: "主辦人管理", icon: "users" as const },
  { key: "platform-feedback" as const, label: "使用者回饋", icon: "comment" as const },
];

const ORG_ROUTES: Record<AdminShellProps["active"], string> = {
  review: "/admin/review",
  format: "/admin/format",
  schedule: "/admin/schedule",
  profile: "/admin/profile",
  judge: "/judge",
  collaborators: "/admin/collaborators",
};

export function AdminShell({
  active,
  children,
  competitions,
  activeCompetitionId,
  isPlatformAdmin = false,
}: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [viewpoint, setViewpointState] = useState<"organizer" | "platform">("organizer");
  const setViewpoint = (v: "organizer" | "platform") => setViewpointState(isPlatformAdmin ? v : "organizer");
  const [section, setSection] = useState<Section>(active);
  const [platformCompetitions, setPlatformCompetitions] = useState<PlatformCompetitionRow[] | null>(null);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [platformOrganizers, setPlatformOrganizers] = useState<PlatformOrganizerRow[] | null>(null);
  const [organizersError, setOrganizersError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [platformFeedback, setPlatformFeedback] = useState<PlatformFeedbackRow[] | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [deletingCompetitionId, setDeletingCompetitionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // DB-06 資安複查(第三方稽核報告第二輪):下面四支操作原本 RPC 失敗就什麼都不做——
  // 按鈕恢復原狀,操作者完全不知道核准/駁回/撤除/刪除其實沒生效。補上錯誤訊息 +
  // 伺服器端 log(見 clientErrorReport.ts)。
  const [competitionActionError, setCompetitionActionError] = useState<string | null>(null);
  const [organizerActionError, setOrganizerActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlatformAdmin || viewpoint !== "platform" || platformCompetitions !== null) return;
    const supabase = createClient();
    supabase
      .from("competitions")
      .select("id, name, registration_opens_at, organizer:profiles!organizer_id(display_name), rounds(voting_closes_at)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("[AdminShell] failed to load platform competitions:", error);
          reportClientError("AdminShell.loadPlatformCompetitions", error.message).catch(() => {});
          setPlatformError("載入失敗，請重新整理頁面再試一次");
          return;
        }
        setPlatformCompetitions((data ?? []) as unknown as PlatformCompetitionRow[]);
      });
  }, [isPlatformAdmin, viewpoint, platformCompetitions]);

  useEffect(() => {
    if (!isPlatformAdmin || viewpoint !== "platform" || platformOrganizers !== null) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("id, display_name, host_revoked_at, host_approved_at")
      .eq("host_setup_completed", true)
      .order("display_name")
      .then(({ data, error }) => {
        if (error) {
          console.error("[AdminShell] failed to load organizers:", error);
          reportClientError("AdminShell.loadOrganizers", error.message).catch(() => {});
          setOrganizersError("載入失敗，請重新整理頁面再試一次");
          return;
        }
        setPlatformOrganizers((data ?? []) as PlatformOrganizerRow[]);
      });
  }, [isPlatformAdmin, viewpoint, platformOrganizers]);

  useEffect(() => {
    if (!isPlatformAdmin || viewpoint !== "platform" || platformFeedback !== null) return;
    const supabase = createClient();
    supabase
      .from("feedback")
      .select("id, message, created_at, profiles(display_name)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("[AdminShell] failed to load feedback:", error);
          reportClientError("AdminShell.loadFeedback", error.message).catch(() => {});
          setFeedbackError("載入失敗，請重新整理頁面再試一次");
          return;
        }
        setPlatformFeedback((data ?? []) as unknown as PlatformFeedbackRow[]);
      });
  }, [isPlatformAdmin, viewpoint, platformFeedback]);

  async function toggleOrganizerRevocation(row: PlatformOrganizerRow) {
    setRevokingId(row.id);
    setOrganizerActionError(null);
    const supabase = createClient();
    const fn = row.host_revoked_at ? "reinstate_organizer" : "revoke_organizer";
    const { error } = await supabase.rpc(fn, { p_profile_id: row.id });
    if (error) {
      console.error("[AdminShell] failed to toggle organizer revocation:", error);
      reportClientError("AdminShell.toggleOrganizerRevocation", error.message).catch(() => {});
      setOrganizerActionError("操作失敗，請重新整理頁面再試一次");
    } else {
      setPlatformOrganizers((prev) =>
        (prev ?? []).map((o) => (o.id === row.id ? { ...o, host_revoked_at: row.host_revoked_at ? null : new Date().toISOString() } : o)),
      );
    }
    setRevokingId(null);
  }

  async function deletePlatformCompetition(id: string) {
    setDeletingCompetitionId(id);
    setCompetitionActionError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_competition", { p_competition_id: id });
    if (error) {
      console.error("[AdminShell] failed to delete competition:", error);
      reportClientError("AdminShell.deletePlatformCompetition", error.message).catch(() => {});
      setCompetitionActionError("刪除失敗，請重新整理頁面再試一次");
    } else {
      setPlatformCompetitions((prev) => (prev ?? []).filter((c) => c.id !== id));
    }
    setConfirmDeleteId(null);
    setDeletingCompetitionId(null);
  }

  async function approveOrganizer(row: PlatformOrganizerRow) {
    setRevokingId(row.id);
    setOrganizerActionError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_organizer_application", { p_profile_id: row.id });
    if (error) {
      console.error("[AdminShell] failed to approve organizer:", error);
      reportClientError("AdminShell.approveOrganizer", error.message).catch(() => {});
      setOrganizerActionError("核准失敗，請重新整理頁面再試一次");
    } else {
      setPlatformOrganizers((prev) =>
        (prev ?? []).map((o) => (o.id === row.id ? { ...o, host_approved_at: new Date().toISOString() } : o)),
      );
    }
    setRevokingId(null);
  }

  async function rejectOrganizer(row: PlatformOrganizerRow) {
    setRevokingId(row.id);
    setOrganizerActionError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("revoke_organizer", { p_profile_id: row.id });
    if (error) {
      console.error("[AdminShell] failed to reject organizer:", error);
      reportClientError("AdminShell.rejectOrganizer", error.message).catch(() => {});
      setOrganizerActionError("駁回失敗，請重新整理頁面再試一次");
    } else {
      setPlatformOrganizers((prev) =>
        (prev ?? []).map((o) => (o.id === row.id ? { ...o, host_revoked_at: new Date().toISOString() } : o)),
      );
    }
    setRevokingId(null);
  }

  function goTo(key: AdminShellProps["active"]) {
    const suffix = activeCompetitionId ? `?c=${activeCompetitionId}` : "";
    router.push(`${ORG_ROUTES[key]}${suffix}`);
  }

  const currentSectionValue = viewpoint === "organizer" ? active : section;
  function handleSectionSelect(value: string) {
    if (viewpoint === "organizer") goTo(value as AdminShellProps["active"]);
    else setSection(value as Section);
  }

  return (
    <div>
      <SiteHeader authed active="admin" roleLabel={viewpoint === "platform" ? "PlatformAdmin" : "Organizer"} />

      {/* DB-04 手機版導覽:側欄在 md 以下完全隱藏(見下方 aside 的 hidden md:block),
          改用這個頂部下拉選單切換分頁——後台選單項目不多,下拉選單比漢堡選單/抽屜
          輕量,不需要額外的展開狀態跟遮罩層。 */}
      <div className="flex flex-col gap-2 border-b border-panel-border bg-black/15 px-4 py-3 md:hidden">
        {isPlatformAdmin && (
          <div className="flex items-center gap-2.5">
            <Switch
              on={viewpoint === "platform"}
              label="切換平台管理員視角與主辦人視角"
              onClick={() => {
                const nv = viewpoint === "platform" ? "organizer" : "platform";
                setViewpoint(nv);
                setSection(nv === "platform" ? "platform-competitions" : active);
              }}
            />
            <span className="text-[11.5px]">{viewpoint === "platform" ? "PlatformAdmin 視角" : "Organizer 視角"}</span>
          </div>
        )}
        {viewpoint === "organizer" && competitions && competitions.length > 0 && (
          <select
            value={activeCompetitionId ?? ""}
            onChange={(e) => router.push(`${pathname}?c=${e.target.value}`)}
            className="w-full appearance-none rounded-[9px] border border-panel-border bg-black/25 px-2.5 py-2 text-[12px] text-ink outline-none focus:border-accent/50 [color-scheme:dark]"
          >
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={currentSectionValue}
          onChange={(e) => handleSectionSelect(e.target.value)}
          className="w-full appearance-none rounded-[9px] border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink outline-none focus:border-accent/50 [color-scheme:dark]"
        >
          {(viewpoint === "organizer" ? ORG_ITEMS : PLATFORM_ITEMS).map((it) => (
            <option key={it.key} value={it.key}>
              {it.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-h-[calc(100vh-44px)]">
        <aside
          className={`hidden flex-none overflow-hidden border-r border-panel-border bg-black/15 transition-[width,padding] md:block ${
            collapsed ? "w-14 px-2 py-4.5" : "w-52 px-3 py-4.5"
          }`}
        >
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "展開側欄" : "收合側欄"}
            className="focus-ring mb-4 flex w-full justify-center rounded-[9px] border border-panel-border bg-white/[0.04] p-2 text-ink-dim transition-colors hover:text-ink"
          >
            <Icon name="chevron" size={13} className={collapsed ? "" : "rotate-90"} />
          </button>

          {!collapsed && isPlatformAdmin && (
            <div className="mb-3.5 flex items-center gap-2.5">
              <Switch
                on={viewpoint === "platform"}
                label="切換平台管理員視角與主辦人視角"
                onClick={() => {
                  const nv = viewpoint === "platform" ? "organizer" : "platform";
                  setViewpoint(nv);
                  setSection(nv === "platform" ? "platform-competitions" : active);
                }}
              />
              <span className="text-[11.5px]">{viewpoint === "platform" ? "PlatformAdmin 視角" : "Organizer 視角"}</span>
            </div>
          )}

          {!collapsed && viewpoint === "organizer" && competitions && competitions.length > 0 && (
            <div className="mb-3.5">
              <label className="mb-1 block text-[10.5px] tracking-wide text-ink-faint uppercase">管理中的比賽</label>
              <select
                value={activeCompetitionId ?? ""}
                onChange={(e) => router.push(`${pathname}?c=${e.target.value}`)}
                className="w-full appearance-none rounded-[9px] border border-panel-border bg-black/25 px-2.5 py-2 text-[12px] text-ink outline-none focus:border-accent/50 [color-scheme:dark]"
              >
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {viewpoint === "organizer" &&
            ORG_ITEMS.map((it) => (
              <button
                key={it.key}
                onClick={() => goTo(it.key)}
                className={`focus-ring mb-1 flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2.25 text-left text-[13px] whitespace-nowrap ${
                  active === it.key
                    ? "border border-accent/28 bg-accent/12 text-ink"
                    : "border border-transparent text-ink-dim hover:bg-white/[0.04] hover:text-ink"
                }`}
              >
                <Icon name={it.icon} size={15} />
                {!collapsed && <span>{it.label}</span>}
              </button>
            ))}
          {viewpoint === "platform" &&
            PLATFORM_ITEMS.map((it) => (
              <button
                key={it.key}
                onClick={() => setSection(it.key)}
                className={`focus-ring mb-1 flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2.25 text-left text-[13px] whitespace-nowrap ${
                  section === it.key
                    ? "border border-accent/28 bg-accent/12 text-ink"
                    : "border border-transparent text-ink-dim hover:bg-white/[0.04] hover:text-ink"
                }`}
              >
                <Icon name={it.icon} size={15} />
                {!collapsed && <span>{it.label}</span>}
              </button>
            ))}
        </aside>

        <main className="min-w-0 flex-1 px-4 pt-9 pb-25 md:px-10">
          {(!isPlatformAdmin || viewpoint === "organizer") && children}

          {isPlatformAdmin && viewpoint === "platform" && section === "platform-competitions" && (
            <div>
              <div className="mb-7">
                <h1 className="font-display text-[30px]">所有主辦人建立的比賽</h1>
                <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
                  作為平台管理員，這裡看得到全站所有比賽；一般主辦人只看得到自己建立的。
                </p>
              </div>
              {competitionActionError && (
                <div className="glass mb-3.5 px-4 py-3 text-[12.5px] text-bad">{competitionActionError}</div>
              )}
              {platformError ? (
                <div className="glass px-4 py-3 text-[12.5px] text-bad">全站比賽清單載入失敗：{platformError}</div>
              ) : platformCompetitions === null ? (
                <div className="flex items-center gap-2.5 py-6 text-[12.5px] text-ink-faint">
                  <span className="spinner" />
                  載入中…
                </div>
              ) : platformCompetitions.length === 0 ? (
                <EmptyState icon="inbox" title="目前平台上還沒有任何比賽" sub="有人建立比賽後會出現在這裡" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-[12.5px]">
                    <thead>
                      <tr>
                        <th className="border-b border-panel-border px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">
                          比賽名稱
                        </th>
                        <th className="border-b border-panel-border px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">
                          主辦人
                        </th>
                        <th className="border-b border-panel-border px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">
                          狀態
                        </th>
                        <th className="border-b border-panel-border px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase" />
                      </tr>
                    </thead>
                    <tbody>
                      {platformCompetitions.map((c) => (
                        <tr key={c.id}>
                          <td className="border-b border-white/5 px-3.5 py-3 text-[13px]">{c.name}</td>
                          <td className="border-b border-white/5 px-3.5 py-3">{organizerName(c)}</td>
                          <td className="border-b border-white/5 px-3.5 py-3">
                            <span className="rounded-full border border-accent/35 bg-accent/8 px-2.25 py-0.75 text-[11px] text-accent">
                              {competitionStatus(c)}
                            </span>
                          </td>
                          <td className="border-b border-white/5 px-3.5 py-3 text-right">
                            {confirmDeleteId === c.id ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => deletePlatformCompetition(c.id)}
                                  disabled={deletingCompetitionId === c.id}
                                  className="rounded-[8px] border border-bad/35 bg-bad/8 px-2.5 py-1 text-[11px] font-semibold text-bad disabled:opacity-45"
                                >
                                  {deletingCompetitionId === c.id ? "刪除中…" : "確定刪除"}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  disabled={deletingCompetitionId === c.id}
                                  className="rounded-[8px] border border-panel-border px-2.5 py-1 text-[11px] text-ink-dim disabled:opacity-45"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(c.id)}
                                className="rounded-[8px] border border-panel-border px-2.5 py-1 text-[11px] text-bad hover:border-bad/40"
                              >
                                刪除
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {isPlatformAdmin && viewpoint === "platform" && section === "platform-organizers" && (
            <div>
              <div className="mb-7">
                <h1 className="font-display text-[30px]">主辦人資格</h1>
                <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
                  主辦人申請需要你核准才能生效。核准後如需撤除,對方所有比賽管理權限立即失效,且無法自行重新設定恢復,只能由你在這裡重新賦予。不影響對方以一般身份參賽,也不影響他已建立比賽的公開內容。
                </p>
              </div>
              {organizerActionError && (
                <div className="glass mb-3.5 px-4 py-3 text-[12.5px] text-bad">{organizerActionError}</div>
              )}
              {organizersError ? (
                <div className="glass px-4 py-3 text-[12.5px] text-bad">主辦人清單載入失敗：{organizersError}</div>
              ) : platformOrganizers === null ? (
                <div className="flex items-center gap-2.5 py-6 text-[12.5px] text-ink-faint">
                  <span className="spinner" />
                  載入中…
                </div>
              ) : platformOrganizers.length === 0 ? (
                <EmptyState icon="users" title="目前平台上還沒有任何主辦人" sub="有使用者完成主辦人身分設定後會出現在這裡" />
              ) : (
                (() => {
                  const pending = platformOrganizers.filter((o) => !o.host_approved_at && !o.host_revoked_at);
                  const approved = platformOrganizers.filter((o) => o.host_approved_at && !o.host_revoked_at);
                  const rejectedOrRevoked = platformOrganizers.filter((o) => o.host_revoked_at);
                  return (
                    <div className="flex flex-col gap-8">
                      {pending.length > 0 && (
                        <div>
                          <h2 className="mb-2.5 text-[13px] font-semibold text-warn">待審核（{pending.length}）</h2>
                          <div className="flex flex-col gap-1.5">
                            {pending.map((o) => (
                              <div key={o.id} className="glass flex items-center justify-between px-4 py-3">
                                <span className="text-[13.5px]">{o.display_name ?? "（未命名）"}</span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => approveOrganizer(o)}
                                    disabled={revokingId === o.id}
                                    className="focus-ring rounded-[10px] border border-ok/35 bg-ok/8 px-3 py-1.5 text-[11.5px] font-semibold text-ok transition-colors hover:bg-ok/14 disabled:opacity-45"
                                  >
                                    核准
                                  </button>
                                  <button
                                    onClick={() => rejectOrganizer(o)}
                                    disabled={revokingId === o.id}
                                    className="focus-ring rounded-[10px] border border-bad/35 bg-bad/8 px-3 py-1.5 text-[11.5px] font-semibold text-bad transition-colors hover:bg-bad/14 disabled:opacity-45"
                                  >
                                    駁回
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <h2 className="mb-2.5 text-[13px] font-semibold text-ink-dim">已核准（{approved.length}）</h2>
                        {approved.length === 0 ? (
                          <p className="text-[12.5px] text-ink-faint">目前沒有已核准的主辦人</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {approved.map((o) => (
                              <div key={o.id} className="glass flex items-center justify-between px-4 py-3">
                                <span className="text-[13.5px]">{o.display_name ?? "（未命名）"}</span>
                                <button
                                  onClick={() => toggleOrganizerRevocation(o)}
                                  disabled={revokingId === o.id}
                                  className="focus-ring rounded-[10px] border border-bad/35 bg-bad/8 px-3 py-1.5 text-[11.5px] font-semibold text-bad transition-colors hover:bg-bad/14 disabled:opacity-45"
                                >
                                  撤除資格
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {rejectedOrRevoked.length > 0 && (
                        <div>
                          <h2 className="mb-2.5 text-[13px] font-semibold text-ink-dim">已駁回／已撤除（{rejectedOrRevoked.length}）</h2>
                          <div className="flex flex-col gap-1.5">
                            {rejectedOrRevoked.map((o) => (
                              <div key={o.id} className="glass flex items-center justify-between px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-[13.5px]">{o.display_name ?? "（未命名）"}</span>
                                  <span className="rounded-full border border-bad/35 bg-bad/8 px-2.25 py-0.75 text-[11px] text-bad">
                                    {o.host_approved_at ? "已撤除" : "已駁回"}
                                  </span>
                                </div>
                                <button
                                  onClick={() => toggleOrganizerRevocation(o)}
                                  disabled={revokingId === o.id}
                                  className="focus-ring rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink transition-colors hover:border-accent/40 disabled:opacity-45"
                                >
                                  {/* 這個按鈕只清 host_revoked_at,從沒被核准過的人(已駁回)點了之後
                                      不會自動變成核准,只是回到待審核——文案要跟實際效果一致。 */}
                                  {o.host_approved_at ? "重新賦予" : "移回待審核"}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {isPlatformAdmin && viewpoint === "platform" && section === "platform-feedback" && (
            <div>
              <div className="mb-7">
                <h1 className="font-display text-[30px]">使用者回饋</h1>
                <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
                  全站「意見回饋」頁送出的訊息，只有平台管理員看得到，寄件人不會知道你有沒有看過或回覆。
                </p>
              </div>
              {feedbackError ? (
                <div className="glass px-4 py-3 text-[12.5px] text-bad">回饋清單載入失敗：{feedbackError}</div>
              ) : platformFeedback === null ? (
                <div className="flex items-center gap-2.5 py-6 text-[12.5px] text-ink-faint">
                  <span className="spinner" />
                  載入中…
                </div>
              ) : platformFeedback.length === 0 ? (
                <EmptyState icon="comment" title="目前還沒有任何回饋" sub="有人送出意見回饋後會出現在這裡" />
              ) : (
                <div className="flex flex-col gap-2">
                  {platformFeedback.map((f) => (
                    <div key={f.id} className="glass px-4 py-3.5">
                      <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-ink-faint">
                        <span>{feedbackAuthorName(f)}</span>
                        <span>{new Date(f.created_at).toLocaleString("zh-TW")}</span>
                      </div>
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{f.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
