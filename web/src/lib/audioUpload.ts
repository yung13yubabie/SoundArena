export const ALLOWED_AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

export const MAX_AUDIO_FILE_SIZE = 60 * 1024 * 1024; // 60MB — 涵蓋一般 WAV 匯出的 3-5 分鐘歌曲

// SA-003 剩餘項目:contentType header 已經綁進簽章(見 storage.ts),不能偽造,但
// 實際上傳的 byte 內容可能根本不是那個格式(例如把任意檔案改副檔名/宣稱成
// audio/mpeg)。只看檔案開頭幾十個 bytes 的已知格式簽章(magic bytes),不解碼
// 完整音訊,足以擋掉「內容跟宣稱格式完全不符」這種明顯造假。
function isMp3(buf: Buffer): boolean {
  if (buf.length < 3) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // "ID3"
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0; // MPEG frame sync
}
function isWav(buf: Buffer): boolean {
  return buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE";
}
function isM4a(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(4, 8).toString("ascii") === "ftyp";
}
function isOgg(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "OggS";
}
function isFlac(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "fLaC";
}

const MAGIC_BYTE_CHECKS: Record<string, (buf: Buffer) => boolean> = {
  "audio/mpeg": isMp3,
  "audio/wav": isWav,
  "audio/x-wav": isWav,
  "audio/mp4": isM4a,
  "audio/x-m4a": isM4a,
  "audio/ogg": isOgg,
  "audio/flac": isFlac,
  "audio/x-flac": isFlac,
};

export function matchesAudioMagicBytes(headBytes: Buffer, contentType: string): boolean {
  const check = MAGIC_BYTE_CHECKS[contentType];
  return check ? check(headBytes) : false;
}
