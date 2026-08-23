"use client";

import { useState, type FormEvent } from "react";
import { AdminShell } from "@/components/AdminShell";
import { createCompetition } from "./actions";

export function CreateCompetitionForm({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState("");
  const [defaultAnonymous, setDefaultAnonymous] = useState(true);

  function handleReview(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirming(true);
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("name", name);
    if (defaultAnonymous) formData.set("default_anonymous", "on");
    const result = await createCompetition(formData);
    if ("error" in result) {
      setError(result.error);
      setPending(false);
    }
    // On success, revalidatePath refreshes this Server Component with the new competition.
  }

  // DB-04/remove_round() 保護的追加需求(grilling 確認):輪次一旦有真實報名/投稿就
  // 鎖定不能自助刪除(見 remove_round()),所以建立比賽前先讓主辦人看清楚會自動建立
  // 哪幾輪再送出,不要靜默直接建立。
  if (confirming) {
    return (
      <AdminShell active="format" isPlatformAdmin={isPlatformAdmin}>
        <div className="mb-7">
          <h1 className="font-display text-[30px]">確認建立「{name}」</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            會自動建立 2 輪：初賽、決賽，兩輪都{defaultAnonymous ? "預設匿名" : "不匿名"}
            。建立後可以在賽制頁新增中間輪次、調整每輪細節，但開放報名後已有真實投稿的輪次就無法自助移除了。
          </p>
        </div>
        <div className="glass max-w-[560px] p-7">
          {error && (
            <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>
          )}
          <div className="flex gap-2.5">
            <button
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-[10px] border border-panel-border bg-white/[0.04] px-4.5 py-2.5 text-[13.5px] font-semibold text-ink disabled:opacity-45"
            >
              返回修改
            </button>
            <button
              onClick={handleConfirm}
              disabled={pending}
              className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
            >
              {pending ? "建立中…" : "確認建立"}
            </button>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell active="format" isPlatformAdmin={isPlatformAdmin}>
      <div className="mb-7">
        <h1 className="font-display text-[30px]">建立你的第一場比賽</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          填基本資料，下一步會先讓你確認要建立的輪次，再正式送出。
        </p>
      </div>

      <form onSubmit={handleReview} className="glass max-w-[560px] p-7">
        <div className="mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">比賽名稱</label>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：深夜擂台 EP.04"
            className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
          />
        </div>
        <label className="mb-5 flex items-center gap-2 text-[12.5px] text-ink-dim">
          <input
            type="checkbox"
            checked={defaultAnonymous}
            onChange={(e) => setDefaultAnonymous(e.target.checked)}
            className="[color-scheme:dark]"
          />
          初賽、決賽預設匿名(投票截止後公開作者身份;之後可在賽制頁逐輪調整)
        </label>

        <button
          type="submit"
          className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08]"
        >
          下一步：確認輪次
        </button>
      </form>
    </AdminShell>
  );
}
