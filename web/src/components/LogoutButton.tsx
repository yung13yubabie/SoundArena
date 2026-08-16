"use client";

import { createClient } from "@/lib/supabase/client";

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
      className="h-[30px] w-[30px] rounded-full border border-panel-border bg-gradient-to-br from-[#3a2018] to-[#1a0f0c]"
    />
  );
}
