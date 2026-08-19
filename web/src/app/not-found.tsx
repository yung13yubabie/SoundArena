import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";

export default function NotFound() {
  return (
    <div>
      <SiteHeader authed={false} />
      <div className="mx-auto flex max-w-[1180px] flex-col items-center px-5 pt-24 pb-24 text-center md:px-11">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff9457] via-accent to-accent-2 text-2xl">
          ◈
        </div>
        <div className="mb-2 text-xs uppercase tracking-widest text-accent">404</div>
        <h1 className="font-display text-[30px]">這個頁面不存在</h1>
        <p className="mt-1.5 max-w-[440px] text-sm leading-relaxed text-ink-dim">
          網址可能打錯了，或是這場比賽／作品已經被移除。
        </p>
        <Link
          href="/"
          className="mt-7 flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-4.5 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-accent/40"
        >
          <Icon name="prev" size={13} />
          回首頁
        </Link>
      </div>
    </div>
  );
}
