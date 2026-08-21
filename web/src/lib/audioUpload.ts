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
