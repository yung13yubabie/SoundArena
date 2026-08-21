const BARE_HANDLE = /^[A-Za-z0-9_.-]{1,40}$/;

export type ParseSunoHandleResult = { ok: true; handle: string } | { ok: false; error: string };

// 報名時「Suno 帳號名稱或個人主頁網址」欄位本來完全沒驗證格式,可以填任何字串
// (包含 YouTube 連結)。這裡只接受純帳號名稱,或 suno.com/@handle 這個個人主頁網址
// 格式——不是 suno.com 網域的一律拒絕,並且明確告知偵測到的是哪個網域。
export function parseSunoHandle(raw: string): ParseSunoHandleResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "請填寫 Suno 帳號" };

  if (trimmed.includes("://") || trimmed.includes("/")) {
    let url: URL;
    try {
      url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    } catch {
      return { ok: false, error: "看起來不是有效的網址，請填寫 suno.com 個人主頁網址或直接填帳號名稱" };
    }
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "suno.com") {
      return { ok: false, error: `這不是 Suno 的網址（偵測到網域是 ${host}），請填寫 suno.com 的個人主頁網址，或直接填帳號名稱` };
    }
    const match = url.pathname.match(/^\/@([A-Za-z0-9_.-]{1,40})\/?$/);
    if (!match) {
      return { ok: false, error: "請填寫 Suno「個人主頁」網址（格式如 https://suno.com/@帳號），不是作品分享連結" };
    }
    return { ok: true, handle: match[1] };
  }

  if (!BARE_HANDLE.test(trimmed)) {
    return { ok: false, error: "帳號名稱只能包含英數字、底線、點、連字號" };
  }
  return { ok: true, handle: trimmed };
}

export type ParseSunoShareUrlResult =
  | { ok: true; code: string; canonicalUrl: string }
  | { ok: false; error: string };

// 投稿時的「Suno 作品分享連結」舊版只用 regex 從字串裡抓 code,完全不檢查
// hostname——攻擊者可以構造 https://evil.example/s/<自己真實的 suno code>,
// 這個 code 本身是真的,Suno API 驗證會通過,但存進 DB、顯示給其他人點擊的
// 卻是 evil.example 這個網址,形成「SoundArena 已驗證作品」的信任外殼包裝
// 釣魚連結的攻擊。這裡先檢查 hostname 一定要是 suno.com,通過才抽 code,
// 而且回傳的是 canonical 網址(https://suno.com/s/<code>),不是使用者原始輸入——
// 存進 DB、顯示給別人看的一律是這個 canonical 版本。
export function parseSunoShareUrl(raw: string): ParseSunoShareUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "請填寫 Suno 分享連結" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "看起來不是有效的網址" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "請使用 https 開頭的 Suno 連結" };
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "suno.com") {
    return { ok: false, error: `這不是 Suno 的網址（偵測到網域是 ${host}），請貼上真正的 suno.com 分享連結` };
  }

  const code = (trimmed.match(/\/s\/([A-Za-z0-9]+)/) || trimmed.match(/[?&]sh=([A-Za-z0-9]+)/) || [])[1];
  if (!code) return { ok: false, error: "看不出這是 Suno 分享連結" };

  return { ok: true, code, canonicalUrl: `https://suno.com/s/${code}` };
}
