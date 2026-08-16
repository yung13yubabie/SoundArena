import Link from "next/link";
import { Icon } from "@/lib/icons";
import { LogoutButton } from "@/components/LogoutButton";

interface SiteHeaderProps {
  authed?: boolean;
  active?: "events" | "competitions" | "vote" | "submit" | "status" | "judge" | "admin";
  roleLabel?: string;
}

// 目前是「全部顯示」的扁平導覽——還沒有真的 Organizer/Judge/PlatformAdmin 角色資料,
// 等角色能從真實登入狀態判斷,再把「評審評分」「管理後台」收進角色專屬的入口。
const NAV_ITEMS: Array<{ key: SiteHeaderProps["active"]; label: string; href: string }> = [
  { key: "events", label: "活動", href: "/" },
  { key: "competitions", label: "比賽", href: "/competitions" },
  { key: "vote", label: "投票", href: "/vote" },
  { key: "submit", label: "上傳作品", href: "/submit" },
  { key: "status", label: "我的狀態", href: "/status" },
  { key: "judge", label: "評審評分", href: "/judge" },
  { key: "admin", label: "管理後台", href: "/admin/review" },
];

export function SiteHeader({ authed = true, active, roleLabel }: SiteHeaderProps) {
  return (
    <header className="flex items-center gap-7 border-b border-panel-border bg-black/15 px-8 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff9457] via-accent to-accent-2 text-[13px]">
          ◈
        </div>
        <span className="text-[14.5px] font-semibold">聲擂 SoundArena</span>
      </div>

      {authed ? (
        <nav className="flex flex-1 gap-5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`border-b-2 py-1.5 text-[13px] transition-colors ${
                active === item.key
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-dim hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center gap-3">
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
            className="rounded-[10px] border border-panel-border bg-white/[0.04] px-4 py-2 text-[13.5px] font-semibold text-ink"
          >
            <Icon name="externalLink" size={13} className="mr-1.5 inline-block align-[-2px]" />
            登入
          </Link>
        )}
      </div>
    </header>
  );
}
