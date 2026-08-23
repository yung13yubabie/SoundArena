"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { LogoutButton } from "@/components/LogoutButton";

interface SiteHeaderProps {
  authed?: boolean;
  active?: "events" | "competitions" | "vote" | "results" | "submit" | "status" | "admin";
  roleLabel?: string;
}

// 評審評分已收進「管理後台」(AdminShell)底下,不是獨立的頂層導覽項——
// SPEC.md 第5節:評分角色是該場比賽 Organizer 底下的權限分工,不是全站角色。
const NAV_ITEMS: Array<{ key: SiteHeaderProps["active"]; label: string; href: string }> = [
  { key: "events", label: "探索比賽", href: "/" },
  { key: "competitions", label: "作品試聽", href: "/competitions" },
  { key: "vote", label: "投票", href: "/vote" },
  { key: "results", label: "結果", href: "/results" },
  { key: "submit", label: "上傳作品", href: "/submit" },
  { key: "status", label: "我的狀態", href: "/status" },
  { key: "admin", label: "管理後台", href: "/admin/review" },
];

export function SiteHeader({ authed = true, active, roleLabel }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-panel-border bg-black/15">
      <div className="flex items-center gap-7 px-5 py-3.5 md:px-8">
        <div className="flex flex-1 items-center gap-2.5 md:flex-none">
          <div className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-[#ff9457] via-accent to-accent-2 text-[13px]">
            ◈
          </div>
          <span className="text-[14.5px] font-semibold">聲擂 SoundArena</span>
        </div>

        <nav className="hidden flex-1 gap-5 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`focus-ring border-b-2 py-1.5 text-[13px] transition-colors ${
                active === item.key ? "border-accent text-ink" : "border-transparent text-ink-dim hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/updates" className="focus-ring text-[12.5px] text-ink-dim transition-colors hover:text-ink">
            更新記錄
          </Link>
          {authed && (
            <Link href="/feedback" className="focus-ring text-[12.5px] text-ink-dim transition-colors hover:text-ink">
              意見回饋
            </Link>
          )}
          {roleLabel && (
            <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11px] text-warn">
              {roleLabel}
            </span>
          )}
          {authed ? (
            <LogoutButton />
          ) : (
            <Link
              href="/login"
              className="focus-ring rounded-[10px] border border-panel-border bg-white/[0.04] px-4 py-2 text-[13.5px] font-semibold text-ink"
            >
              <Icon name="externalLink" size={13} className="mr-1.5 inline-block align-[-2px]" />
              登入
            </Link>
          )}
        </div>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "關閉選單" : "開啟選單"}
          aria-expanded={menuOpen}
          className="focus-ring flex h-9 w-9 flex-none items-center justify-center rounded-[9px] border border-panel-border text-ink-dim md:hidden"
        >
          <Icon name={menuOpen ? "close" : "menu"} size={17} />
        </button>
      </div>

      {menuOpen && (
        <div className="flex flex-col gap-1 border-t border-panel-border px-5 py-3.5 md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`focus-ring rounded-[9px] px-2.5 py-2 text-[13.5px] ${
                active === item.key ? "bg-accent/12 text-ink" : "text-ink-dim"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2.5 border-t border-panel-border pt-3">
            <Link
              href="/updates"
              onClick={() => setMenuOpen(false)}
              className="focus-ring px-2.5 text-[12.5px] text-ink-dim"
            >
              更新記錄
            </Link>
            {authed && (
              <Link
                href="/feedback"
                onClick={() => setMenuOpen(false)}
                className="focus-ring px-2.5 text-[12.5px] text-ink-dim"
              >
                意見回饋
              </Link>
            )}
            {roleLabel && (
              <span className="mx-2.5 w-fit rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11px] text-warn">
                {roleLabel}
              </span>
            )}
            <div className="px-2.5">
              {authed ? (
                <LogoutButton />
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="focus-ring inline-flex items-center rounded-[10px] border border-panel-border bg-white/[0.04] px-4 py-2 text-[13.5px] font-semibold text-ink"
                >
                  <Icon name="externalLink" size={13} className="mr-1.5 inline-block align-[-2px]" />
                  登入
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
