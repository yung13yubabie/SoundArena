# AnonymityMode 從 Competition 層級三選一,改成每輪各自的匿名開關

推翻 SPEC.md 第5節 / CONTEXT.md 原本的 AnonymityMode 設計:不再是 Competition 建立時三選一(全程匿名決賽才公開 / 單輪匿名賽後公開 / 全程公開),改為每個 Round 各自一個布林值「這輪要不要匿名」,搭配 Competition 層級一個「全部套用」的批次動作方便一次設定所有輪次,設定完仍可針對個別 Round 再調整。使用者的理由:三選一的「全程匿名,決賽才公開」這個模式(等到最後一輪才把所有輪次身份一次揭露)不是真正需要的行為,逐輪各自決定「這輪匿不匿名、投票一截止就公開該輪」已經夠用,不需要保留跨輪次延遲揭露的複雜度。

揭露時機因此簡化成單一規則,不再需要判斷「是不是決賽」:**該輪標記匿名時,投票截止(`voting_closes_at` 已過)才揭露該輪身份;沒標記匿名的輪次從一開始就公開**。`round_identity_revealed()`、`get_round_submissions()`、Comment 的身份顯示邏輯全部改吃這個新規則。

## Consequences

- 新增 `rounds.is_anonymous boolean not null default true`(預設匿名,呼應原本 Competition 建立表單的預設值 `per_round_anonymous`,新輪次沿用同一個保守預設)
- `competitions.anonymity_mode` 這個欄位跟三個 enum 值**保留但變成 vestigial(不再被任何邏輯讀取)**——沒有直接砍掉的原因是既有的 `CreateCompetitionForm`/`CompetitionMetaForm`/對應的 Server Action 目前還在寫入這個欄位,這輪只處理 schema/RLS,不動 UI(使用者這輪的要求範圍),留著欄位讓現有畫面不會寫入失敗。等下一輪把「全部套用 + 個別調整」的畫面做出來時,要同時把這個欄位跟三選一下拉選單一起拔掉,不要讓兩套機制同時存在造成混淆
- 「全部套用」是 UI 層的批次動作(一次把所有 Round 的 `is_anonymous` 設成同一個值),不是資料庫層的獨立概念,不需要另外的欄位或表格
