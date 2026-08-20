"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { updateDisplayName } from "./actions";

export function DisplayNameEditor({ initialName }: { initialName: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    const result = await updateDisplayName(name);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setName(initialName);
          setEditing(true);
        }}
        className="focus-ring flex items-center gap-1.5 text-[12.5px] text-ink-faint transition-colors hover:text-ink"
      >
        <Icon name="user" size={13} />
        {initialName}
        <span className="text-ink-faint">（改暱稱）</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        className="w-44 rounded-[8px] border border-panel-border bg-black/25 px-2.5 py-1.25 text-[12.5px] text-ink outline-none focus:border-accent/50"
      />
      <button
        onClick={save}
        disabled={pending}
        className="focus-ring rounded-[8px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-2.5 py-1.25 text-[11.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
      >
        {pending ? "儲存中…" : "儲存"}
      </button>
      <button
        onClick={() => setEditing(false)}
        disabled={pending}
        className="focus-ring rounded-[8px] border border-panel-border px-2.5 py-1.25 text-[11.5px] text-ink-dim"
      >
        取消
      </button>
      {error && <span className="text-[11.5px] text-bad">{error}</span>}
    </div>
  );
}
