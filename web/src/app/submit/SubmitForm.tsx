"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { submitEntry, verifySunoSharer, requestAudioUpload, selectTeamSubmission } from "./actions";
import { ALLOWED_AUDIO_TYPES, MAX_AUDIO_FILE_SIZE } from "@/lib/audioUpload";

export interface TeamMember {
  registrationId: string;
  displayName: string;
}

export interface TeamCandidate {
  submissionId: string;
  title: string | null;
  uploaderDisplayName: string;
  isSelected: boolean;
  sunoShareUrl: string;
}

export interface RoundOption {
  roundId: string;
  registrationId: string;
  sunoHandle: string;
  label: string;
  theme: { type: string; value: string } | null;
  team: {
    teamId: string;
    teamName: string;
    isCaptain: boolean;
    captainDisplayName: string;
    members: TeamMember[];
    candidates: TeamCandidate[];
  } | null;
}

type ParseResult =
  | { kind: "invalid" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "match" | "mismatch"; author: string; handle: string; avatarUrl: string | null };

async function parseSunoLink(url: string, expectedHandle: string): Promise<ParseResult> {
  const result = await verifySunoSharer(url);
  if (result.kind !== "ok") return result;
  const matches = result.info.sharerHandle.trim().toLowerCase() === expectedHandle.trim().toLowerCase();
  return {
    kind: matches ? "match" : "mismatch",
    author: result.info.sharerDisplayName,
    handle: result.info.sharerHandle,
    avatarUrl: result.info.avatarUrl,
  };
}

type ParseState = "idle" | "loading" | "ok" | "mismatch" | "invalid" | "not_found" | "error";
type UploadState = "idle" | "uploading" | "done" | "error";

export function SubmitForm({ options }: { options: RoundOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(options[0]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [state, setState] = useState<ParseState>("idle");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [processDoc, setProcessDoc] = useState("");
  const [ethicalSourcingDeclared, setEthicalSourcingDeclared] = useState(false);
  const [allowPublicPlayback, setAllowPublicPlayback] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  async function handleSelectCandidate(submissionId: string) {
    setSelectingId(submissionId);
    setSelectError(null);
    const result = await selectTeamSubmission(submissionId);
    setSelectingId(null);
    if ("error" in result) {
      setSelectError(result.error);
    } else {
      router.refresh();
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [audioObjectKey, setAudioObjectKey] = useState<string | null>(null);

  function pickFile() {
    fileInputRef.current?.click();
  }

  function clearUpload() {
    setUploadState("idle");
    setUploadProgress(0);
    setUploadFileName(null);
    setUploadError(null);
    setAudioObjectKey(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_AUDIO_TYPES[file.type]) {
      setUploadState("error");
      setUploadError("檔案格式不支援，請上傳 mp3/wav/m4a/ogg/flac");
      return;
    }
    if (file.size > MAX_AUDIO_FILE_SIZE) {
      setUploadState("error");
      setUploadError(`檔案太大，最大 ${Math.floor(MAX_AUDIO_FILE_SIZE / 1024 / 1024)}MB`);
      return;
    }

    setUploadState("uploading");
    setUploadProgress(0);
    setUploadFileName(file.name);
    setUploadError(null);
    setAudioObjectKey(null);

    const requested = await requestAudioUpload(selected.registrationId, file.type, file.size);
    if ("error" in requested) {
      setUploadState("error");
      setUploadError(requested.error);
      return;
    }

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadState("done");
          setUploadProgress(100);
          setAudioObjectKey(requested.objectKey);
        } else {
          setUploadState("error");
          setUploadError("上傳失敗，請再試一次");
        }
        resolve();
      });
      xhr.addEventListener("error", () => {
        setUploadState("error");
        setUploadError("上傳失敗，請檢查網路連線後再試一次");
        resolve();
      });
      xhr.open("PUT", requested.uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
    });
  }

  async function runParse() {
    if (!url.trim()) return;
    setState("loading");
    setResult(null);
    const r = await parseSunoLink(url, selected.sunoHandle);
    setResult(r.kind === "invalid" ? null : r);
    if (r.kind === "match") setState("ok");
    else setState(r.kind);
  }

  const okResult = result && (result.kind === "match" || result.kind === "mismatch") ? result : null;
  const errorMessage = result && result.kind === "error" ? result.message : null;

  async function handleSubmit() {
    if (!okResult || state !== "ok" || !title.trim()) return;
    setPending(true);
    setError(null);
    const result = await submitEntry({
      roundId: selected.roundId,
      registrationId: selected.registrationId,
      sunoShareUrl: url,
      title: title.trim(),
      coverImageUrl: null,
      sharerHandle: okResult.handle,
      lyrics,
      allowPublicPlayback,
      audioObjectKey,
      processDoc,
      ethicalSourcingDeclared,
      teamId: selected.team?.teamId ?? null,
    });
    setPending(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div>
        <SiteHeader authed active="submit" />
        <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
          <div className="mb-7">
            <h1 className="font-display text-[30px]">投稿已送出</h1>
          </div>
          <div className="glass max-w-[560px] p-7">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-3.5 text-[12.5px] text-ok">
              <Icon name="check" />
              {selected.team
                ? `「${title}」已送出，成為隊伍候選版本，待隊長選定為正式投稿`
                : `「${title}」已送出，狀態轉為「待人工審核」`}
            </div>
            <Link
              href="/status"
              className="mt-3.5 inline-block rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08]"
            >
              前往「我的狀態」查看進度 →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SiteHeader authed active="submit" />
      <div className="mx-auto max-w-[1180px] px-5 md:px-11 pt-10 pb-24">
        <div className="mb-7">
          <h1 className="font-display text-[30px]">投稿本輪作品</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            貼上 Suno 分享連結，我們會自動確認是不是你本人的作品；標題目前 Suno 那邊查不到，需要自己填寫。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] items-start gap-6">
          <div>
            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">所屬賽制 / 比賽場次</label>
              <select
                value={selected.roundId}
                onChange={(e) => {
                  const next = options.find((o) => o.roundId === e.target.value);
                  if (next) {
                    setSelected(next);
                    setState("idle");
                    setResult(null);
                    if (next.registrationId !== selected.registrationId) clearUpload();
                  }
                }}
                className="w-full appearance-none rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50 [color-scheme:dark]"
              >
                {options.map((o) => (
                  <option key={o.roundId} value={o.roundId}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
                審核通過後，系統會自動把這首作品加入所選賽制對應輪次的歌曲清單，不需要另外操作。
              </div>
              {selected.theme && (
                <div className="mt-2.5 flex items-center gap-2 rounded-[10px] border border-accent/25 bg-accent/8 px-3.5 py-2.5 text-[12.5px] text-accent">
                  <Icon name="star" size={14} />
                  本輪限定主題（{selected.theme.type}）：{selected.theme.value}
                </div>
              )}
            </div>

            {selected.team && (
              <div className="mb-5 rounded-[10px] border border-panel-border bg-white/[0.02] p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">隊伍：{selected.team.teamName}</span>
                  <span className="text-[11.5px] text-ink-faint">
                    隊長：{selected.team.captainDisplayName}
                    {selected.team.isCaptain && "（就是你）"}
                  </span>
                </div>
                <div className="mb-2.5 text-[11.5px] text-ink-faint">
                  隊員：{selected.team.members.map((m) => m.displayName).join("、")}
                </div>
                {selected.team.candidates.length > 0 && (
                  <div className="mb-2.5 flex flex-col gap-1.5">
                    <div className="text-[11px] tracking-wide text-ink-faint uppercase">隊伍候選版本</div>
                    {selected.team.candidates.map((c) => (
                      <div
                        key={c.submissionId}
                        className="flex items-center justify-between gap-2 rounded-[8px] border border-panel-border bg-black/20 px-3 py-2 text-[12px]"
                      >
                        <span className="min-w-0 truncate">
                          {c.title ?? "未命名作品"} <span className="text-ink-faint">by {c.uploaderDisplayName}</span>
                        </span>
                        {c.isSelected ? (
                          <span className="flex-none rounded-full border border-ok/35 bg-ok/8 px-2 py-0.5 text-[10.5px] text-ok">
                            目前送出
                          </span>
                        ) : selected.team!.isCaptain ? (
                          <button
                            type="button"
                            disabled={selectingId === c.submissionId}
                            onClick={() => handleSelectCandidate(c.submissionId)}
                            className="flex-none rounded-full border border-accent/35 bg-accent/8 px-2 py-0.5 text-[10.5px] text-accent disabled:opacity-45"
                          >
                            {selectingId === c.submissionId ? "設定中…" : "選為正式投稿"}
                          </button>
                        ) : (
                          <span className="flex-none text-[10.5px] text-ink-faint">候選中</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {selectError && <p className="mb-1 text-[11.5px] text-bad">{selectError}</p>}
                <div className="text-[11.5px] leading-relaxed text-ink-faint">
                  隊伍賽一隊共用一筆正式投稿：隊員都可以上傳候選版本，最終由隊長選定其中一筆送出；截止前沒選的話，系統會自動選最後上傳的一筆。
                </div>
              </div>
            )}

            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">Suno 作品分享連結</label>
              <input
                className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
                placeholder="https://suno.com/s/…"
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
                  <span className="spinner" /> 驗證中，正在比對投稿者身份…
                </div>
              )}
              {state === "invalid" && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-bad/30 bg-bad/8 px-3.5 py-3 text-[12.5px] text-bad">
                  <Icon name="alert" /> 看不出這是 Suno 分享連結，請確認網址格式（例如 suno.com/s/…）
                </div>
              )}
              {state === "not_found" && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-bad/30 bg-bad/8 px-3.5 py-3 text-[12.5px] text-bad">
                  <Icon name="alert" /> Suno 找不到這個分享連結對應的作品，請確認連結正確，且該作品仍設為公開分享
                </div>
              )}
              {state === "error" && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-bad/30 bg-bad/8 px-3.5 py-3 text-[12.5px] text-bad">
                  <Icon name="alert" /> {errorMessage ?? "驗證時發生錯誤，請稍後再試"}
                </div>
              )}
              {state === "ok" && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-ok/30 bg-ok/8 px-3.5 py-3 text-[12.5px] text-ok">
                  <Icon name="check" /> 身份比對通過（sharer 帳號 @{okResult?.handle} 與報名帳號一致）
                </div>
              )}
              {state === "mismatch" && (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-bad/30 bg-bad/8 px-3.5 py-3 text-[12.5px] text-bad">
                  <Icon name="alert" /> 這個連結的作者帳號（@{okResult?.handle}）與你報名時填寫的 Suno 帳號（{selected.sunoHandle}）不一致，請確認貼的是自己的作品連結
                </div>
              )}
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">作品標題</label>
              <input
                className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
                placeholder="填寫這首作品的標題"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">上傳音檔案（播放用，選填）</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,audio/flac,audio/x-flac"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files?.[0])}
              />
              {uploadState === "idle" ? (
                <button
                  type="button"
                  onClick={pickFile}
                  className="w-full rounded-[12px] border-1.5 border-dashed border-panel-border px-6.5 py-6.5 text-center text-[12.5px] text-ink-faint transition-colors hover:border-accent/40 hover:text-ink-dim"
                >
                  <Icon name="upload" className="inline-block" />
                  <br />
                  點擊選擇音檔（mp3/wav/m4a/ogg/flac，最大 {Math.floor(MAX_AUDIO_FILE_SIZE / 1024 / 1024)}MB）
                </button>
              ) : (
                <div className="rounded-[12px] border border-panel-border bg-white/[0.03] px-4.5 py-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[12.5px] text-ink">{uploadFileName}</span>
                    <button
                      type="button"
                      onClick={clearUpload}
                      className="flex-none text-[11.5px] text-ink-faint hover:text-bad"
                    >
                      移除
                    </button>
                  </div>
                  {uploadState === "uploading" && (
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-white/12">
                      <span
                        className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 transition-[width]"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                  {uploadState === "done" && (
                    <div className="flex items-center gap-1.5 text-[12px] text-ok">
                      <Icon name="check" size={13} /> 上傳完成
                    </div>
                  )}
                  {uploadState === "error" && (
                    <div className="flex items-center gap-1.5 text-[12px] text-bad">
                      <Icon name="alert" size={13} /> {uploadError}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
                從 Suno 下載後上傳原始檔案，通過審核的作品會在站內直接播放；不上傳的話，其他人只能點連結到 Suno 上聽。
                比賽完全結束後，只有最終排名前三名的音檔會保留，其餘參賽者的音檔將會清除（Suno 連結不受影響，仍可點擊收聽）。
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">歌詞</label>
              <textarea
                className="min-h-37.5 w-full resize-y rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none focus:border-accent/50"
                placeholder="請貼上完整歌詞（此欄位無法自動抓取，需自行提供）"
                value={lyrics}
                maxLength={30000}
                onChange={(e) => setLyrics(e.target.value)}
              />
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">創作過程說明（Process Doc，選填）</label>
              <textarea
                className="min-h-37.5 w-full resize-y rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none focus:border-accent/50"
                placeholder="逐工具、逐 prompt 交代創作過程：用了哪些 AI 工具、下了什麼提示詞、中間失敗/修改/驚喜的地方。如果這場比賽有評「AI 使用方式」的項目，評審會看這份說明來評分。"
                value={processDoc}
                maxLength={20000}
                onChange={(e) => setProcessDoc(e.target.value)}
              />
            </div>

            <label className="mb-5 flex items-center gap-2 text-[12.5px] text-ink-dim">
              <input
                type="checkbox"
                checked={ethicalSourcingDeclared}
                onChange={(e) => setEthicalSourcingDeclared(e.target.checked)}
              />
              我聲明本作品主要使用的 AI 工具標榜公平訓練、尊重版權（自主聲明，平台不驗證）
            </label>

            <label className="mb-5 flex items-center gap-2 text-[12.5px] text-ink-dim">
              <input
                type="checkbox"
                checked={allowPublicPlayback}
                onChange={(e) => setAllowPublicPlayback(e.target.checked)}
              />
              允許在 Discovery 頁公開展示這首作品（未登入訪客可試聽），預設關閉
            </label>

            {error && (
              <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>
            )}

            <button
              disabled={state !== "ok" || pending || !title.trim() || uploadState === "uploading"}
              onClick={handleSubmit}
              className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
            >
              {pending ? "送出中…" : "送出投稿"}
            </button>
          </div>

          <div className="glass sticky top-19 p-5">
            <div className="mb-3.5 flex aspect-square w-full items-center justify-center rounded-[10px] border border-panel-border bg-gradient-to-br from-[#2a1712] to-[#1a0f0c] text-center text-[11.5px] text-ink-faint">
              {okResult?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={okResult.avatarUrl} alt="" className="h-full w-full rounded-[10px] object-cover" />
              ) : (
                "尚未解析"
              )}
            </div>
            <div className="mb-1 text-[15px]">{title || "— 標題待填寫 —"}</div>
            <div className="mb-3.5 text-[12.5px] text-ink-dim">
              {okResult ? `by ${okResult.author} (@${okResult.handle})` : "作者待帶入"}
            </div>
            <div className="flex justify-between border-t border-panel-border py-1.75 text-[11.5px] text-ink-faint">
              <span>投稿至</span>
              <span>{selected.label}</span>
            </div>
            <div className="flex justify-between border-t border-panel-border py-1.75 text-[11.5px] text-ink-faint">
              <span>資料來源</span>
              <span>Suno 官方資料</span>
            </div>
            <div className="flex justify-between border-t border-panel-border py-1.75 text-[11.5px] text-ink-faint">
              <span>身份比對</span>
              <span>
                {state === "ok" ? (
                  <span className="rounded-full border border-ok/35 bg-ok/8 px-2.25 py-0.75 text-[11px] text-ok">通過</span>
                ) : state === "mismatch" || state === "not_found" || state === "error" ? (
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
