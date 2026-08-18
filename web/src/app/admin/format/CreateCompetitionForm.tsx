"use client";

import { useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { createCompetition } from "./actions";

export function CreateCompetitionForm({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await createCompetition(formData);
    if ("error" in result) {
      setError(result.error);
      setPending(false);
    }
    // On success, revalidatePath refreshes this Server Component with the new competition.
  }

  return (
    <AdminShell active="format" isPlatformAdmin={isPlatformAdmin}>
      <div className="mb-7">
        <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 賽制建立</div>
        <h1 className="font-display text-[30px]">建立你的第一場比賽</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          填基本資料就會建立比賽，並自動生成初賽、決賽兩輪，之後可以再新增中間輪次、調整賽制。
        </p>
      </div>

      <form action={handleSubmit} className="glass max-w-[560px] p-7">
        <div className="mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">比賽名稱</label>
          <input
            name="name"
            required
            placeholder="例如：深夜擂台 EP.04"
            className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
          />
        </div>
        <label className="mb-5 flex items-center gap-2 text-[12.5px] text-ink-dim">
          <input type="checkbox" name="default_anonymous" defaultChecked className="[color-scheme:dark]" />
          初賽、決賽預設匿名(投票截止後公開作者身份;之後可在賽制頁逐輪調整)
        </label>

        {error && (
          <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
        >
          {pending ? "建立中…" : "建立比賽"}
        </button>
      </form>
    </AdminShell>
  );
}
