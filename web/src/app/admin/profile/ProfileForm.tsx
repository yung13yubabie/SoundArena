"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { Avatar } from "@/components/Avatar";
import { youtubeEmbedUrl } from "@/lib/youtube";
import { saveOrganizerProfile, type OrganizerProfileInput } from "./actions";

interface ProfileFormProps {
  userId: string;
  displayName: string;
  hostedCount: number;
  initial: OrganizerProfileInput;
  alreadySetup: boolean;
}

export function ProfileForm({ userId, displayName, hostedCount, initial, alreadySetup }: ProfileFormProps) {
  const [bio, setBio] = useState(initial.bio);
  const [socialLink, setSocialLink] = useState(initial.socialLink);
  const [featuredTrackUrl, setFeaturedTrackUrl] = useState(initial.featuredTrackUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const embedUrl = youtubeEmbedUrl(featuredTrackUrl);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await saveOrganizerProfile({ bio, socialLink, featuredTrackUrl });
    setPending(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setSaved(true);
    }
  }

  return (
    <div className="grid grid-cols-[1fr_300px] items-start gap-6">
      <div className="glass p-7">
        {!alreadySetup && (
          <div className="mb-5 flex items-center gap-2.5 rounded-[10px] border border-warn/30 bg-warn/8 p-3.5 text-[12.5px] text-warn">
            <Icon name="alert" size={15} />
            第一次使用管理後台要先完成這裡，儲存後才能進賽制建立／時程設定／審核後台。
          </div>
        )}

        <div className="mb-5 flex items-center gap-3">
          <Avatar name={displayName} size={48} />
          <div>
            <div className="text-[15px] font-semibold">{displayName}</div>
            <div className="text-[11.5px] text-ink-faint">主辦過 {hostedCount} 場比賽</div>
          </div>
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">簡介</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="跟參賽者介紹一下你自己、辦比賽的風格"
            className="min-h-25 w-full resize-y rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none focus:border-accent/50"
          />
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">社群連結</label>
          <input
            value={socialLink}
            onChange={(e) => setSocialLink(e.target.value)}
            placeholder="https://youtube.com/@your-channel"
            className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
          />
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">推薦一首自己的歌（YouTube 連結）</label>
          <input
            value={featuredTrackUrl}
            onChange={(e) => setFeaturedTrackUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
            className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
          />
          {featuredTrackUrl && !embedUrl && (
            <div className="mt-1.5 text-[11.5px] text-bad">看不出這是 YouTube 連結，確認格式（例如 youtube.com/watch?v=…）</div>
          )}
        </div>

        {error && (
          <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>
        )}
        {saved && (
          <p className="mb-4 flex items-center gap-2 rounded-[10px] border border-ok/30 bg-ok/10 p-2.5 text-[12px] text-ok">
            <Icon name="check" size={14} /> 已儲存
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
          >
            {pending ? "儲存中…" : "儲存"}
          </button>
          {alreadySetup && (
            <Link href={`/u/${userId}`} className="text-[12.5px] text-ink-faint underline hover:text-ink">
              查看公開檔案 →
            </Link>
          )}
        </div>
      </div>

      <div className="glass sticky top-19 p-5">
        <div className="mb-3.5 text-[11.5px] text-ink-faint">預覽</div>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            className="mb-3.5 aspect-video w-full rounded-[10px] border border-panel-border"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="mb-3.5 flex aspect-video w-full items-center justify-center rounded-[10px] border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c] text-center text-[11.5px] text-ink-faint">
            尚未設定推薦曲目
          </div>
        )}
        <div className="text-[13px] font-semibold">{displayName}</div>
        <div className="mt-1 text-[12px] leading-relaxed text-ink-dim">{bio || "（尚未填寫簡介）"}</div>
      </div>
    </div>
  );
}
