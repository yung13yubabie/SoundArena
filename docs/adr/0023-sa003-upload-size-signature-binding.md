# ADR-0023:SA-003 修復——presigned upload 簽章綁定實際檔案大小

延續 ADR-0020 的第三方稽核複查,使用者這輪要求繼續處理 SA-003(上傳檔案大小未綁進簽章),明確要求用 `mattpocock-skills` 系列的 `systematic-debugging` 紀律處理——不能只讀報告文字就動手修,要先自己重新證明問題真的存在,再找根因,再驗證修法。

## Phase 1:Root Cause Investigation(先證明漏洞是真的,不是憑空相信報告)

寫了一支診斷腳本,完全比照 `web/src/lib/storage.ts` 的 `createUploadUrl()` 簽章方式(`PutObjectCommand` 只帶 `Bucket`/`Key`/`ContentType`),對正式 B2 bucket 做真實 PUT 測試:核發一個「宣稱檔案大小 1MB」的 presigned URL,實際上傳一個 5MB 的 buffer。

**結果:PUT 回傳 200,HeadObject 複查確認完整 5MB 落地在 B2**。SA-003 確認為真——presigned URL 對實際上傳大小完全沒有約束力,`requestAudioUpload()` 核發 URL「之前」對 `fileSize` 的檢查只是應用層的軟性把關,拿到 URL 之後可以上傳任意大小的檔案。

## Phase 2:Pattern Analysis(有沒有更小的修法,不用整套 provisional-upload 架構)

第三方報告建議的完整修法是「upload_intent → upload → verify → attach → cleanup」的完整生命週期(新表、quota、孤兒檔案 GC)。在設計這麼大的改動之前,先測試一個假設:S3 相容簽章如果把 `ContentLength` 也包進 `PutObjectCommand`,B2 會不會依此驗證實際上傳的大小。

寫了第二支診斷腳本對比兩種情境:(A)簽章綁定 1MB,實際上傳 5MB;(B)簽章綁定 1MB,實際上傳剛好 1MB。**結果:A 被 B2 拒絕(`403 SignatureDoesNotMatch`),B 成功且大小完全相符**。這證實只要把 `ContentLength` 納入簽章,S3 相容的簽章驗證機制本身就會把「上傳大小」變成簽章的一部分——偽造大小不再是應用層的軟性檢查能不能繞過的問題,而是直接讓整個簽章失效。

這比報告建議的完整生命週期表簡單得多,而且是**直接堵住問題的技術根因**(簽章沒綁大小),不是加一層事後檢查。

## Phase 3 & 4:假設驗證與實作

確認 `SubmitForm.tsx` 已經傳真實 `file.size`(`requestAudioUpload(selected.registrationId, file.type, file.size)`)——前端完全不用改,瀏覽器上傳時 XHR 送出的 body 本來就是那個 `File` 物件本身,Content-Length 天然等於 `file.size`。

**修法**:

- `web/src/lib/storage.ts`:`createUploadUrl()` 新增 `contentLength: number` 參數,傳進 `PutObjectCommand` 的 `ContentLength`。
- `web/src/app/submit/actions.ts`:`requestAudioUpload()` 把已經驗證過(`fileSize > MAX_AUDIO_FILE_SIZE` 檢查通過)的 `fileSize` 傳給 `createUploadUrl()`。

效果:`requestAudioUpload()` 核發的 URL 現在只能拿來上傳「剛好等於當初驗證通過的那個大小」的檔案——多一 byte 少一 byte 都會讓簽章失效,不只是擋掉「超過 60MB」,而是徹底堵死「宣稱一個大小、實際傳另一個大小」這整條路徑。

## 這輪沒有做的部分(SA-003 報告的其餘驗收標準)

第三方報告對 SA-003 還列了幾項,這次刻意沒有一起做,原因記錄如下:

- **每位 user/registration 的 upload issuance quota**:`getSignedUrl()` 是純本地簽章運算,不會呼叫 B2 API,核發 URL 本身幾乎零成本——真正的成本風險是「上傳後從不送出投稿的孤兒檔案」累積佔用儲存空間,不是核發 URL 這個動作本身。
- **provisional upload 的 DB 生命週期 + 孤兒檔案自動回收**:目前如果使用者拿到 URL、真的上傳了檔案,卻從未呼叫 `submit_entry()` 完成投稿,這個物件會永遠留在 B2,系統完全不知道它存在(`audio_object_key` 只有投稿成功才會寫進 DB)。這是真實的長期儲存成本風險,但跟這次修的「單次上傳可以偽造大小」是不同性質的問題,需要新的 DB 表或跟既有的 `/api/cron/cleanup-audio` retention job 整合設計,規模比這次的修法大。
- **MIME 最終由 server/object metadata 驗證**:目前 `contentType` 只在核發 URL 前對照 `ALLOWED_AUDIO_TYPES` allowlist,B2 儲存時標記的 Content-Type 是使用者宣稱的,沒有驗證實際 byte 內容真的是音訊格式。

這三項留給使用者決定要不要繼續做、做到多深。

## 驗證

`tsc`/`eslint`/`build` 全程乾淨(eslint 剩 2 個跟本次改動無關的既有警告)。核心修法(ContentLength 簽章綁定)本身已經用兩支獨立診斷腳本對正式 B2 環境做過真實驗證(Phase 1 證明漏洞存在、Phase 2 證明修法有效),`createUploadUrl()` 是唯一呼叫點,沒有其他程式碼路徑受影響。
