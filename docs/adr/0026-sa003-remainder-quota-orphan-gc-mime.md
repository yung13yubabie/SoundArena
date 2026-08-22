# ADR-0026:SA-003 剩餘三項——quota、provisional upload 生命週期 + 孤兒回收、MIME 內容驗證

延續 ADR-0023(簽章綁定實際檔案大小)。按 `/goal` 繼續處理稽核剩餘項目,這輪把 SA-003 完整收尾。

## 資料模型:`pending_uploads`

新增一張表追蹤「誰、什麼時候、申請了一個 upload URL、宣稱的 content-type 是什麼」:

```sql
create table pending_uploads (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  object_key text not null unique,
  content_type text not null,
  declared_size bigint not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
```

用 `consumed_at`(null = 還沒被任何投稿吃掉)表示狀態,不用額外的 enum——跟 ADR-0024(SA-006)保留 `audio_object_key` 供重試的手法同一種精神:用「有沒有值」表示狀態。RLS 只開放 registration owner 自己 insert/select。

`submit_entry()` 簽章跟回傳型別都沒變,內部多一步:真的被拿來投稿的 `audio_object_key`,對應的 `pending_uploads` 列標記 `consumed_at`,讓孤兒掃描知道這個物件「已經有主」。

## Quota

`requestAudioUpload()` 核發 URL 前先查這個 registration 過去 24 小時內、還沒被消費的 `pending_uploads` 筆數,超過 20 筆就拒絕。20 是刻意寬鬆的門檻——正常使用者調整/重傳幾次完全不會撞到,只擋真的在批次濫用的情況。核發 URL 本身幾乎零成本(純本地簽章運算),真正的風險是「重複申請卻從不真的送出投稿」累積孤兒物件,quota 只是配合孤兒回收的第一道防線。

## 孤兒檔案自動回收

延伸既有的 `/api/cron/cleanup-audio`(ADR-0019 建立的每日排程):額外掃描 `pending_uploads` 裡 `consumed_at is null` 且 `created_at` 超過 48 小時的紀錄,刪除對應的 B2 物件後才刪除該筆紀錄——跟 ADR-0024(SA-006)同一套「只有刪除真的成功才清紀錄」原則,失敗就留著讓下一輪重試。48 小時的緩衝期是為了不清掉使用者正在填表單、還沒送出投稿的合法上傳。B2 的 `DeleteObject` 對不存在的 key 是 idempotent 成功,所以「拿到 URL 但根本沒真的上傳」的情況這裡也會自然被清乾淨,不需要另外判斷物件是否存在。

## MIME 內容驗證(magic bytes)

`ContentType` header 已經在 ADR-0023 之前就綁進簽章(跟 ADR-0023 綁 `ContentLength`是同一個 `PutObjectCommand`),不能靠偽造 header 繞過——但這只保證「宣稱的 Content-Type 沒被中途竄改」,不保證「實際 byte 內容真的是那個格式」。新增 `matchesAudioMagicBytes()`(`web/src/lib/audioUpload.ts`),檢查 mp3(`ID3` 或 MPEG frame sync)、wav(`RIFF`...`WAVE`)、m4a(`ftyp`)、ogg(`OggS`)、flac(`fLaC`)五種格式的已知檔頭簽章,搭配新的 `getObjectHeadBytes()`(`web/src/lib/storage.ts`,用 S3 `Range` GET 只抓開頭 64 bytes,不用整個下載)。

驗證時機選在**投稿當下**(`submitEntry()`),不是上傳當下——投稿才是「這個檔案真的要被使用」的時間點,驗證失敗就刪除 B2 物件並拒絕這次投稿,不讓格式不符的檔案進入正式流程。

## 真實 PoC(9/9 通過,分兩支腳本)

- magic bytes 純函式邏輯:真實 ID3 header 正確判定為 mp3、純文字偽裝正確判定為不符合。
- `pending_uploads` RLS:registration owner 可以 insert,陌生人不行(`42501`)。
- `submit_entry()` 成功後,對應的 `pending_uploads.consumed_at` 真的被標記。
- 孤兒掃描查詢(48 小時 + 未消費)正確抓到過期紀錄,且不誤抓已經 consumed 的那筆;模擬 cron 實際執行清理後,DB 裡真的查不到了。
- `getObjectHeadBytes()` 對應的 Range GET 邏輯:對一個真的上傳到 B2 的 ID3 mp3 開頭做 Range GET,抓到的 bytes 通過 magic bytes 驗證。
- quota 計數查詢:插入 20 筆未消費紀錄後,`requestAudioUpload()` 實際使用的計數查詢正確算出 20,達到門檻應觸發拒絕。

`tsc`/`eslint`/`build` 全程乾淨,`audioUpload.ts` 新增的 `Buffer` 相關函式沒有影響到 client bundle(`SubmitForm.tsx` 只 import 原本就有的 `ALLOWED_AUDIO_TYPES`/`MAX_AUDIO_FILE_SIZE`,build 沒有出現任何 Node-only API 洩漏進 client bundle 的錯誤)。

至此 SA-003 全部驗收標準(實際物件大小綁定、quota、provisional lifecycle、孤兒回收、MIME 內容驗證)都已處理完成。
