"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { Switch } from "@/components/Switch";
import { EmptyState } from "@/components/EmptyState";
import { MOCK_ALL_COMPETITIONS_PLATFORM, MOCK_REPORTS } from "@/lib/mockData";

type Section = "review" | "format" | "schedule" | "profile" | "platform-competitions" | "platform-reports";

interface AdminCompetitionOption {
  id: string;
  name: string;
}

interface AdminShellProps {
  active: "review" | "format" | "schedule" | "profile";
  children: ReactNode;
  competitions?: AdminCompetitionOption[];
  activeCompetitionId?: string;
}

const ORG_ITEMS = [
  { key: "review" as const, label: "審核後台", icon: "shield" as const },
  { key: "format" as const, label: "賽制建立", icon: "crown" as const },
  { key: "schedule" as const, label: "時程設定", icon: "calendar" as const },
  { key: "profile" as const, label: "主辦人身分", icon: "user" as const },
];

const PLATFORM_ITEMS = [
  { key: "platform-competitions" as const, label: "全站比賽", icon: "inbox" as const },
  { key: "platform-reports" as const, label: "檢舉處理", icon: "alert" as const },
];

const ORG_ROUTES: Record<AdminShellProps["active"], string> = {
  review: "/admin/review",
  format: "/admin/format",
  schedule: "/admin/schedule",
  profile: "/admin/profile",
};

export function AdminShell({ active, children, competitions, activeCompetitionId }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [viewpoint, setViewpoint] = useState<"organizer" | "platform">("organizer");
  const [section, setSection] = useState<Section>(active);
  const [reports, setReports] = useState(MOCK_REPORTS);

  function goTo(key: AdminShellProps["active"]) {
    const suffix = activeCompetitionId ? `?c=${activeCompetitionId}` : "";
    router.push(`${ORG_ROUTES[key]}${suffix}`);
  }

  const resolveReport = (id: number) =>
    setReports((rs) => rs.map((r) => (r.id === id ? { ...r, state: "resolved" as const } : r)));

  const pendingCount = reports.filter((r) => r.state === "pending").length;

  return (
    <div>
      <SiteHeader authed active="admin" roleLabel={viewpoint === "platform" ? "PlatformAdmin" : "Organizer"} />
      <div className="flex min-h-[calc(100vh-44px)]">
        <aside
          className={`flex-none overflow-hidden border-r border-panel-border bg-black/15 transition-[width,padding] ${
            collapsed ? "w-14 px-2 py-4.5" : "w-52 px-3 py-4.5"
          }`}
        >
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "展開側欄" : "收合側欄"}
            className="mb-4 flex w-full justify-center rounded-[9px] border border-panel-border bg-white/[0.04] p-2 text-ink-dim"
          >
            <Icon name="chevron" size={13} className={collapsed ? "" : "rotate-90"} />
          </button>

          {!collapsed && (
            <div className="mb-3.5 flex items-center gap-2.5">
              <Switch
                on={viewpoint === "platform"}
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
                className={`mb-1 flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2.25 text-left text-[13px] whitespace-nowrap ${
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
                className={`mb-1 flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2.25 text-left text-[13px] whitespace-nowrap ${
                  section === it.key
                    ? "border border-accent/28 bg-accent/12 text-ink"
                    : "border border-transparent text-ink-dim hover:bg-white/[0.04] hover:text-ink"
                }`}
              >
                <Icon name={it.icon} size={15} />
                {!collapsed && <span>{it.label}</span>}
                {!collapsed && it.key === "platform-reports" && pendingCount > 0 && (
                  <span className="ml-auto rounded-full border border-bad/35 bg-bad/8 px-2 py-0.5 text-[11px] text-bad">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
        </aside>

        <main className="min-w-0 flex-1 px-10 pt-9 pb-25">
          {viewpoint === "organizer" && children}

          {viewpoint === "platform" && section === "platform-competitions" && (
            <div>
              <div className="mb-7">
                <div className="mb-2 text-xs uppercase tracking-widest text-accent">PlatformAdmin · 全站比賽</div>
                <h1 className="font-display text-[30px]">所有 Organizer 建立的比賽</h1>
                <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
                  PlatformAdmin 看得到全站比賽，Organizer 只看得到自己建立的（見 SPEC.md 第 0 節角色分層）。
                </p>
              </div>
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    <th className="border-b border-panel-border px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">
                      比賽名稱
                    </th>
                    <th className="border-b border-panel-border px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">
                      Organizer
                    </th>
                    <th className="border-b border-panel-border px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">
                      狀態
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_ALL_COMPETITIONS_PLATFORM.map((c) => (
                    <tr key={c.id}>
                      <td className="border-b border-white/5 px-3.5 py-3 text-[13px]">{c.name}</td>
                      <td className="border-b border-white/5 px-3.5 py-3">{c.organizer}</td>
                      <td className="border-b border-white/5 px-3.5 py-3">
                        <span className="rounded-full border border-accent/35 bg-accent/8 px-2.25 py-0.75 text-[11px] text-accent">
                          {c.status === "active" ? "進行中" : "即將開始"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {viewpoint === "platform" && section === "platform-reports" && (
            <div>
              <div className="mb-7">
                <div className="mb-2 text-xs uppercase tracking-widest text-accent">PlatformAdmin · 檢舉處理</div>
                <h1 className="font-display text-[30px]">待處理檢舉</h1>
                <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
                  檢舉對象是整場比賽，不是個別投稿（個別投稿內容由該比賽自己的 Organizer 審核）。
                </p>
              </div>
              {pendingCount === 0 ? (
                <EmptyState icon="check" title="目前沒有待處理的檢舉" sub="所有檢舉都已處理完畢" />
              ) : (
                reports.map((r) => (
                  <div
                    key={r.id}
                    className={`glass mb-2.5 p-4 ${r.state === "resolved" ? "opacity-45" : ""}`}
                  >
                    <div className="mb-2 flex justify-between">
                      <span className="text-[13.5px] font-semibold">{r.competition}</span>
                      <span className="rounded-full border border-panel-border px-2.25 py-0.75 text-[11px] text-ink-dim">
                        檢舉人：{r.reporter}
                      </span>
                    </div>
                    <div className="mb-2.5 text-[12.5px] text-ink-dim">{r.reason}</div>
                    {r.state === "pending" ? (
                      <button
                        onClick={() => resolveReport(r.id)}
                        className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3.5 py-1.5 text-[11.5px] font-semibold text-[#1a0e08]"
                      >
                        標記已處理
                      </button>
                    ) : (
                      <span className="rounded-full border border-ok/35 bg-ok/8 px-2.25 py-0.75 text-[11px] text-ok">
                        已處理
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
