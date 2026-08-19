"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";

interface PageTip {
  title: string;
  tips: string[];
}

function getPageTip(pathname: string): PageTip | null {
  if (pathname === "/") {
    return { title: "活動首頁", tips: ["瀏覽目前開放的比賽，點進去看詳情或報名。", "右上角「登入」可用 Google 或 Discord 帳號。"] };
  }
  if (pathname.startsWith("/competitions")) {
    return { title: "比賽試聽", tips: ["點一場比賽可以聽目前輪次已核准的公開作品。", "作品是否公開由投稿者自己在「我的狀態」設定。"] };
  }
  if (pathname === "/register") {
    return { title: "報名", tips: ["填完資料後由主辦人審核，審核中可到「我的狀態」查看進度。", "被退回會顯示原因，可修改後重新送出（有 10 分鐘冷卻時間）。"] };
  }
  if (pathname.startsWith("/vote")) {
    return { title: "投票", tips: ["聽完作品再投票，是否顯示投稿者身分由主辦人設定。", "投票後可以在作品下方留言互動。"] };
  }
  if (pathname.startsWith("/results")) {
    return { title: "結果", tips: ["顯示各輪分數與名次，主辦人設定的計分項目都會列在這裡。"] };
  }
  if (pathname === "/submit") {
    return { title: "投稿", tips: ["貼上 Suno 分享連結送出，審核通過後才會出現在投票頁。", "投稿前要先完成報名並通過審核。"] };
  }
  if (pathname.startsWith("/status")) {
    return { title: "我的狀態", tips: ["查看每場比賽、每一輪的投稿與審核進度。", "可個別關閉某場比賽的通知，或設定作品／報名是否公開。"] };
  }
  if (pathname.startsWith("/u/")) {
    return { title: "公開檔案", tips: ["這裡顯示的是使用者自己選擇公開的報名與作品紀錄。"] };
  }
  if (pathname === "/feedback") {
    return { title: "意見回饋", tips: ["有任何問題或建議都可以在這裡留言給平台。"] };
  }
  if (pathname === "/updates") {
    return { title: "更新記錄", tips: ["這裡記錄平台功能的更新歷程。"] };
  }
  if (pathname.startsWith("/judge")) {
    return { title: "評審後台", tips: ["為目前輪次的作品評分，分數會即時反映在結果頁。"] };
  }
  if (pathname.startsWith("/admin/format")) {
    return { title: "賽制設定", tips: ["設定比賽的輪次、計分項目與時程骨架。"] };
  }
  if (pathname.startsWith("/admin/review")) {
    return { title: "審核後台", tips: ["審核報名與投稿，退回時記得填理由，對方會看到。"] };
  }
  if (pathname.startsWith("/admin/schedule")) {
    return { title: "時程設定", tips: ["設定報名／投稿／投票各階段的起訖時間。", "下方「分享文字」可一鍵複製報名公告貼到社群或 Discord。"] };
  }
  if (pathname.startsWith("/admin/collaborators")) {
    return { title: "協作者管理", tips: ["用 Email 邀請協作者，並指定他能操作的權限範圍（審核／評分／時程等）。"] };
  }
  if (pathname.startsWith("/admin/profile")) {
    return { title: "主辦人資料", tips: ["填寫主辦人簡介，完成後才能建立／管理比賽。"] };
  }
  return null;
}

export function HelpBubble() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const tip = getPageTip(pathname ?? "");
  if (!tip) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2.5">
      {open && (
        <div className="glass w-[260px] rounded-[14px] px-4 py-3.5 text-[12.5px] leading-relaxed text-ink-dim shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">{tip.title}</span>
            <button onClick={() => setOpen(false)} className="focus-ring text-ink-faint transition-colors hover:text-ink" aria-label="收起說明">
              <Icon name="close" size={14} />
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {tip.tips.map((t) => (
              <li key={t} className="flex gap-1.5">
                <span className="text-accent">・</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        title="操作說明"
        aria-label="操作說明"
        className="focus-ring flex h-11 w-11 items-center justify-center rounded-full border border-panel-border bg-gradient-to-br from-[#ff9457] via-accent to-accent-2 text-[17px] font-semibold text-black/80 shadow-lg transition-transform hover:scale-105"
      >
        ?
      </button>
    </div>
  );
}
