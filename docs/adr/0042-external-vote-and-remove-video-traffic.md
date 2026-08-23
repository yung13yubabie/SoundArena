# ADR-0042:評分機制第一批——`external_vote` 補上真正的邏輯、移除死選項 `video_traffic`

使用者確認要開始整理評分機制,先從「列出目前有哪些範本」開始盤點(小地基原則)。

## 查證發現:兩個範本從建置以來就是空殼

盤點 `score_item_templates`(12 個範本)時發現 `external_vote`(外部投票)跟 `video_traffic`(影片流量)都沒有進到 `get_round_scores()` 的任何 CASE 分支,兩者都落在 `else`(跟一般「額外加分」項目一樣,只能由評審手動輸入數字)。`video_traffic` 對應到 SoundArena 完全沒有影片功能——這是個純音訊平台,這個選項從一開始就不該存在。

## 修法

**`external_vote`**:跟使用者確認定義後(只算「沒有在這場比賽報名過」的登入使用者投的票,投票動作本身不變,`vote` 範本繼續算全部票包含參賽者互投),在 `get_round_scores()` 加一條 CASE 分支:`not exists (select 1 from registrations where competition_id = ... and user_id = voter_id)`。

**`video_traffic`**:直接從 `score_item_templates` 移除。第一次跑 migration 時被 `score_items.template_id` 的 `on delete restrict` 外鍵擋下——查出來使用者自己的「好友測試賽」測試比賽真的選過這個範本(兩筆 score_items,25%/0% 權重)。跟使用者確認整場比賽都是可以清掉的測試資料後,直接把這場測試比賽也一併刪除,不去猜測怎麼調整剩餘項目的權重去補足 100%(對「已確認的測試資料」而言,這是多此一舉)。

## 驗證

真實 PoC(3/3,對正式 Supabase 環境):`vote` 範本正確算進參賽者互投的那一票、`external_vote` 正確排除那一票只算外部票。過程中抓到一個 PoC 腳本自己的 bug——兩個 weighted 計分項目分開各自 `insert()`,各自的交易裡權重總和不到 100%,撞上既有的 deferred constraint 卻沒檢查 insert 的 error,靜默失敗,改成同一次 `insert([...])` 陣列送出後才抓到真正的結果。`web/scripts/security-regression.mjs` 新增對應 2 項長期守護,32/32 通過。`tsc`/`eslint`/`build` 全程乾淨,純 SQL 改動,沒有動 TypeScript。
