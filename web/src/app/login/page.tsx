"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "discord";

export default function LoginPage() {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(provider: Provider) {
    setError(null);
    setLoadingProvider(provider);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: provider === "google" ? "openid email profile" : "identify guilds.join",
      },
    });

    if (error) {
      setError(error.message);
      setLoadingProvider(null);
    }
  }

  return (
    <div>
      <SiteHeader authed={false} />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
          <div className="glass w-[420px] p-10 text-center">
            <div className="mx-auto mb-4.5 flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff9457] via-accent to-accent-2 text-[22px]">
              ◈
            </div>
            <h1 className="font-display text-[22px]">聲擂 SoundArena</h1>
            <p className="mb-6 text-[13px] text-ink-dim">登入以投稿、投票、追蹤賽事進度</p>

            {error && (
              <p className="mb-2.5 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">
                登入失敗：{error}
              </p>
            )}

            <button
              onClick={() => handleLogin("google")}
              disabled={loadingProvider !== null}
              className="mb-2.5 flex w-full items-center justify-center gap-2 rounded-[10px] bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[#3c3c3c] disabled:opacity-60"
            >
              <Icon name="externalLink" size={14} />
              {loadingProvider === "google" ? "跳轉中…" : "使用 Google 繼續"}
            </button>
            <button
              onClick={() => handleLogin("discord")}
              disabled={loadingProvider !== null}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#5865F2] px-4 py-2.5 text-[13.5px] font-semibold text-[#0d0e21] disabled:opacity-60"
            >
              <Icon name="externalLink" size={14} />
              {loadingProvider === "discord" ? "跳轉中…" : "使用 Discord 登入"}
            </button>

            <div className="glass mt-5.5 p-4 text-left text-[11.5px] leading-relaxed text-ink-faint">
              <b className="text-ink-dim">Discord 登入</b>
              後會另外詢問是否加入 SoundArena 伺服器 — bot 需在同一伺服器內才能私訊或公告賽事結果。
              <br />
              <br />
              如果不想收到任何通知，使用 <b className="text-ink-dim">Google 帳號</b>
              登入即可 — 不會觸發加入伺服器的流程。
              <br />
              <br />
              Discord 可以跳過，之後在「通知設定」頁再連結。
              <br />
              <br />
              LINE 登入暫未開放，之後會補上。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
