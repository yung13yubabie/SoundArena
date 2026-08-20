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
