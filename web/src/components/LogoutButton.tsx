"use client";

import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";

export function LogoutButton() {
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleLogout}
      title="登出"
      className="flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-2 text-[13px] text-ink-dim transition-colors hover:border-bad/40 hover:text-bad"
    >
      <Icon name="logout" size={14} />
      登出
    </button>
  );
}
