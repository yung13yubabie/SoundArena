# ADR-0025:SA-010 文件重置——README/SPEC/CONTEXT 對齊現況

繼續處理稽核批次(`/goal` 授權持續進行)。SA-010 指出 README/SPEC/CONTEXT/HANDOFF 對同一個產品存在互斥的「真相」,新 session 很容易依錯誤資訊做錯安全決策。逐一核對後,實際發現三個檔案漂移程度差異很大。

## 核對結果

- **README.md**:漂移最嚴重。「任何使用者建立第一場比賽即自動成為 Organizer,不需要平台審核」——ADR-0014 已經反轉這個決策(需要 PlatformAdmin 審核)。「PlatformAdmin 處理跨比賽的檢舉」——Report 機制已在 ADR-0007 整個拿掉。「音檔儲存:Cloudflare R2」——ADR-0017 已改用 Backblaze B2。「目前畫面仍使用假資料,尚未接上真實的比賽/投稿/投票讀寫」——這是專案最早期的狀態,現在核心流程全部接了真實 Supabase 讀寫。開場白暗示 LINE/Discord bot 已經在發通知,但 LINE 登入根本還沒開通、Discord/Resend 的實際寄送也還沒串接(`ADR-0009` 早就誠實記錄這件事)。
- **SPEC.md**:同樣的 Organizer 審核制、Report 移除兩項漂移,另外播放網址過期時間寫「建議 5–10 分鐘」,但實際實作是 1 小時(`storage.ts` 的 `getPlaybackUrl(key, expiresInSeconds = 3600)`)——SPEC 沒有跟著更新成真正採用的值。開場的「現有雛形...以下規格尚未實作」也是專案最早期的描述,現在規格大部分已實作完成。
- **CONTEXT.md**:漂移程度比想像中低——PlatformAdmin 詞條已經正確記錄 Report 被 ADR-0007 移除;真正漏掉的是 Organizer 詞條仍寫著「自動成為 Organizer,沒有額外的申請或審核步驟」,沒跟上 ADR-0014。

**沒有發現漂移的部分**:CONTEXT.md 的 Collaborator、CommentEndorsement、Registration、Submission、NotificationEvent 等詞條都跟現行程式碼/RLS 行為一致,不需要動;ADR 序列(0001–0024)本身持續在每次改動時同步寫,是這幾個文件裡最可信的一份,這次沒有調整 ADR 本身的內容,只是拿它們當事實來源去修正 README/SPEC/CONTEXT。

## 修法

三個檔案都用「這份文件現在描述的是什麼」為準改寫,不是用對話語氣補丁——README.md 的「開發狀態」段落改成準確描述現況並指向 HANDOFF.md/docs/adr/ 作為持續更新的來源,不再自己重複維護一份會過期的狀態快照。SPEC.md 開場加一句話明確定位:規格記錄設計意圖(WHAT/WHY),現況以 HANDOFF/ADR 為準,兩者不衝突——規格不會因為實作細節微調就跟著頻繁改,但重大決策反轉(像 ADR-0014 這種)確實要回來更新規格本身,不能讓規格停在被推翻的舊設計。

這次沒有動 HANDOFF.md 本身的內容準確性(HANDOFF.md 本來就是每次改動後即時更新,沒有觀察到漂移),只在這份 ADR 記錄的當下順便在 HANDOFF 補一筆這輪的文件整理工作。
