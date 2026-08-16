"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";

// Mock 解析結果——依貼上的連結內容分支，不是無論輸入什麼都同一個結果。
// 兩筆是實測過的真實 Suno 分享碼；其餘一律視為「格式看起來對但非本人」示範 error 分支。
// 正式串接時由後端呼叫 Suno 公開 API 取代（見 SPEC.md 第 3 節）。
const MOCK_SUNO_LOOKUP: Record<string, { title: string; author: string; handle: string; match: boolean }> = {
  IKWrakvC2p7TUqRZ: { title: "抽象善良", author: "MY", handle: "my13u", match: true },
  hl1nj5kSmsClebsu: { title: "路上ランウェイ", author: "Grudge Grocery Store", handle: "grudgegrocerystore", match: false },
};

type ParseResult =
  | { kind: "invalid" }
  | { kind: "match" | "mismatch"; title: string; author: string; handle: string };

function mockParseSunoLink(url: string): ParseResult {
  // Suno 分享連結有兩種等價格式，兩種都要認得：
  //   短連結：suno.com/s/{code}
  //   展開後的完整網址：suno.com/song/{uuid}?sh={code}
  const code = (url.match(/\/s\/([A-Za-z0-9]+)/) || url.match(/[?&]sh=([A-Za-z0-9]+)/) || [])[1];
  if (!code) return { kind: "invalid" };
  const hit = MOCK_SUNO_LOOKUP[code];
  if (hit) return { kind: hit.match ? "match" : "mismatch", ...hit };
  return { kind: "mismatch", title: "（未知作品）", author: "未知帳號", handle: "unknown" };
}

type ParseState = "idle" | "loading" | "ok" | "error" | "invalid";

export default function SubmitPage() {
  const [url, setUrl] = useState("https://suno.com/s/IKWrakvC2p7TUqRZ");
  const [state, setState] = useState<ParseState>("idle");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const runParse = () => {
    setState("loading");
    setResult(null);
    setTimeout(() => {
      const r = mockParseSunoLink(url);
      if (r.kind === "invalid") {
        setState("invalid");
        return;
      }
      setState(r.kind === "match" ? "ok" : "error");
      setResult(r);
    }, 1000);
  };

  const okResult = result && result.kind !== "invalid" ? result : null;

  if (submitted) {
    return (
      <div>
        <SiteHeader authed active="submit" />
        <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
          <div className="mb-7">
            <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 投稿</div>
            <h1 className="font-display text-[30px]">投稿已送出</h1>
          </div>
          <div className="glass max-w-[560px] p-7">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-3.5 text-[12.5px] text-ok">
              <Icon name="check" />
              「{okResult?.title}」已送出，狀態轉為「待人工審核」（Submission 狀態機下一站，見「個人狀態」頁查看進度）
            </div>
            <button
              className="mt-3.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-4.5 py-2.5 text-[13.5px] font-semibold text-ink"
              onClick={() => {
                setSubmitted(false);
                setState("idle");
                setResult(null);
              }}
            >
              投稿另一首
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SiteHeader authed active="submit" />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 投稿</div>
          <h1 className="font-display text-[30px]">投稿本輪作品</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            貼上 Suno 分享連結，系統會自動帶出標題、封面、作者，並確認是不是你本人的作品。
          </p>
        </div>

        <div className="grid grid-cols-[1fr_300px] items-start gap-6">
          <div>
            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">所屬賽制 / 比賽場次</label>
              <select
                defaultValue="r2"
                className="w-full appearance-none rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
              >
                <option value="r1">深夜擂台 EP.03 · 第 1 輪 海選（已截止）</option>
                <option value="r2">深夜擂台 EP.03 · 第 2 輪 複賽（投稿開放中）</option>
              </select>
              <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
                審核通過後，系統會自動把這首作品加入所選賽制對應輪次的歌曲清單，不需要另外操作。
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">Suno 作品分享連結</label>
              <input
                className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setState("idle");
                  setResult(null);
                }}
                onBlur={runParse}
              />
              {state === "loading" && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-3 text-[12.5px] text-ink-dim">
                  <span className="spinner" /> 解析連結中，正在比對投稿者身份…
                </div>
              )}
              {state === "invalid" && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-bad/30 bg-bad/8 px-3.5 py-3 text-[12.5px] text-bad">
                  <Icon name="alert" /> 看不出這是 Suno 分享連結，請確認網址格式（例如 suno.com/s/…）
                </div>
              )}
              {state === "ok" && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/8 px-3.5 py-3 text-[12.5px] text-ok">
                  <Icon name="check" /> 身份比對通過（sharer 與報名帳號一致），已自動帶入下方資料
                </div>
              )}
              {state === "error" && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-bad/30 bg-bad/8 px-3.5 py-3 text-[12.5px] text-bad">
                  <Icon name="alert" /> 這個連結的作者帳號（{okResult?.handle}）與你報名時填寫的 Suno 帳號不一致，請確認貼的是自己的作品連結
                </div>
              )}
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">上傳音檔案（播放用）</label>
              <div
                className={`rounded-[12px] border-1.5 px-6.5 py-6.5 text-center text-[12.5px] ${
                  state === "ok"
                    ? "border-solid border-ok/35 bg-ok/5 text-ok"
                    : "border-dashed border-panel-border text-ink-faint"
                }`}
              >
                {state === "ok" ? (
                  <>
                    <Icon name="check" className="inline-block" /> {okResult?.title}.mp3 — 已上傳（3:22）
                  </>
                ) : (
                  <>
                    <Icon name="upload" className="inline-block" />
                    <br />
                    拖曳音檔到此，或點擊選擇檔案
                  </>
                )}
              </div>
              <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
                從 Suno 下載後上傳的原始檔案，將存放於私有儲存空間，播放時由系統動態簽發短效網址。
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">歌詞</label>
              <textarea
                className="min-h-37.5 w-full resize-y rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none focus:border-accent/50"
                placeholder="請貼上完整歌詞（此欄位無法自動抓取，需自行提供）"
              />
            </div>

            <button
              disabled={state !== "ok"}
              onClick={() => setSubmitted(true)}
              className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
            >
              送出投稿
            </button>
          </div>

          <div className="glass sticky top-19 p-5">
            <div className="mb-3.5 flex aspect-square w-full items-center justify-center rounded-[10px] border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c] text-center text-[11.5px] text-ink-faint">
              {state === "ok" ? `封面圖（自動帶入・${okResult?.title}）` : "尚未解析"}
            </div>
            <div className="mb-1 text-[15px]">{state === "ok" ? okResult?.title : "— 標題待帶入 —"}</div>
            <div className="mb-3.5 text-[12.5px] text-ink-dim">
              {state === "ok" ? `by ${okResult?.author} (@${okResult?.handle})` : "作者待帶入"}
            </div>
            <div className="flex justify-between border-t border-panel-border py-1.75 text-[11.5px] text-ink-faint">
              <span>投稿至</span>
              <span>第 2 輪 複賽</span>
            </div>
            <div className="flex justify-between border-t border-panel-border py-1.75 text-[11.5px] text-ink-faint">
              <span>資料來源</span>
              <span>Suno 公開分享 API</span>
            </div>
            <div className="flex justify-between border-t border-panel-border py-1.75 text-[11.5px] text-ink-faint">
              <span>身份比對</span>
              <span>
                {state === "ok" ? (
                  <span className="rounded-full border border-ok/35 bg-ok/8 px-2.25 py-0.75 text-[11px] text-ok">通過</span>
                ) : state === "error" ? (
                  <span className="rounded-full border border-bad/35 bg-bad/8 px-2.25 py-0.75 text-[11px] text-bad">不通過</span>
                ) : (
                  <span className="rounded-full border border-panel-border px-2.25 py-0.75 text-[11px] text-ink-dim">待驗證</span>
                )}
              </span>
            </div>
            <div className="flex justify-between border-t border-panel-border py-1.75 text-[11.5px] text-ink-faint">
              <span>審核狀態</span>
              <span className="rounded-full border border-warn/35 bg-warn/8 px-2.25 py-0.75 text-[11px] text-warn">待人工審核</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
