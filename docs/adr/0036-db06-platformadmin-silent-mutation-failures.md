# ADR-0036:DB-06——PlatformAdmin 的四個操作按鈕,失敗時完全沒有任何回饋

第二輪第三方稽核報告點名 PlatformAdmin 後台的操作可能靜默失敗。查證 `AdminShell.tsx` 後確認為真,且範圍明確:核准主辦人申請(`approveOrganizer`)、駁回申請(`rejectOrganizer`)、撤除/重新賦予主辦資格(`toggleOrganizerRevocation`)、強制刪除比賽(`deletePlatformCompetition`)這四支操作,原本的寫法一律是:

```ts
const { error } = await supabase.rpc(...);
if (!error) {
  // 只在成功時更新畫面狀態
}
setRevokingId(null); // 不管成功失敗都恢復按鈕原狀
```

RPC 失敗時(權限錯誤、網路問題、RLS 擋下)沒有 `else` 分支——按鈕就是恢復成沒點過的樣子,沒有錯誤訊息、沒有 console.error、沒有任何紀錄。PlatformAdmin 點了「核准」以為主辦人已經核准,實際上什麼都沒發生,而且無從得知。

同一個檔案裡讀取資料的三個 `useEffect`(`loadPlatformCompetitions`/`loadOrganizers`/`loadFeedback`)本來就有完整的錯誤處理(ADR-0028/SA-012 加的),只有這四支「寫入」操作漏掉了對稱的處理——這是純粹的疏漏,不是刻意的設計差異。

## 修法

比照既有讀取錯誤的處理方式,四支操作補上:失敗時 `console.error` + 呼叫 `reportClientError()`(DB-15 剛加固過的伺服器端可見 log)+ 在畫面上顯示「操作失敗,請重新整理頁面再試一次」之類的具體訊息。`clientErrorReport.ts` 的 context 白名單新增這四個呼叫點(`AdminShell.toggleOrganizerRevocation`/`approveOrganizer`/`rejectOrganizer`/`deletePlatformCompetition`)。

錯誤訊息用兩個新的 state(`competitionActionError`/`organizerActionError`)分別掛在「全站比賽」跟「主辦人資格」兩個分頁,渲染方式沿用同一個檔案裡既有的 `platformError`/`organizersError` 視覺樣式(`glass` 卡片 + `text-bad`),不是新發明的元件。

純前端邏輯變更,沒有動 RLS/RPC 邊界本身,不需要新的 `security-regression.mjs` 檢查或對正式環境的 PoC。

## 驗證

`tsc`/`eslint`/`build` 全程乾淨。
