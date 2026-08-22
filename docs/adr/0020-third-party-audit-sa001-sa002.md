# ADR-0020：第三方 SaaS 稽核報告獨立複查 + SA-001/SA-002 修復

使用者丟了一份第三方 AI 產生的完整 SaaS production audit 報告(13 項 findings, SA-001~SA-013),明確要求用 `mattpocock-skills:systematic-debugging` 紀律處理——不能照單全收,要先獨立複查每一項主張是否屬實,再決定修什麼。這份 ADR 記錄複查過程與 SA-001/SA-002 的修復(使用者這輪核准的範圍;其餘 findings 見文末「複查結果總覽」,尚未動手)。

## 複查方法

對 4 個 P1 逐一用實際 code/migration 內容核對(不是讀報告文字就相信),每一項都能指出具體檔案/行數作為證據:

- **SA-002(截止時間非硬性邊界)**:讀 `register/actions.ts` 確認 `registerForCompetition()` 是直接 `.insert()`,再讀 `registrations` 的 INSERT policy(`20260816104605`)確認只檢查 `auth.uid() = user_id`。投稿端更嚴重——`grep -rn allows_new_submissions` 全專案,確認這個欄位從 schema 建立以來沒有任何地方寫成過 `false`,是完全死掉的檢查;`submission_opens_at/closes_at` 兩個真正的時間戳記除了 `/admin/schedule` 寫入畫面外,沒有任何地方讀取比對。
- **SA-001(Judge 匿名性只在 UI)**:讀 `20260817011000_extend_policies_for_collaborators.sql` 確認 `registrations readable by organizer or collaborator` policy 對 `judge` 權限也開放整列 SELECT,沒有欄位層級限制;讀 `judge/page.tsx` 確認它實際只需要 `registrations(id, status)` 兩個欄位,卻透過整表可讀的 RLS 讓 judge 權限的協作者能繞過 UI 直接查到 `user_id`/`display_name`/`suno_handle`。
- **SA-003(上傳檔案大小未綁進簽章)**:讀 `storage.ts` 的 `createUploadUrl()`,確認 `PutObjectCommand` 只簽了 `Bucket`/`Key`/`ContentType`,沒有 `ContentLength`。
- **SA-004(CI 沒有安全回歸測試)**:讀 `.github/workflows/ci.yml`,確認只有 `eslint` + `build`。

四個 P1 全部確認屬實。另外快速核對了幾個 P2(SA-006/007/008/009/013),同樣確認屬實(SA-006 甚至是這個 session 自己這輪寫的 cron 程式碼)。SA-011(email signup 未關閉)只查得到本機 `config.toml`,跟報告自己標注的一樣是「Unable to Verify」等級,沒有 production 實際設定的證據,不提升為 CONFIRMED。

使用者確認這輪範圍是「SA-001 + SA-002 先修」,SA-003(上傳生命週期重構)跟 SA-004(CI 安全測試矩陣)規模明顯更大,留到之後個別討論。

## SA-002 修法:截止時間收進 DB

新增 `20260822010000_deadline_db_invariants.sql`:

- **報名**:`registrations insertable by self` policy 加一條 `exists` 子查詢,檢查 `competitions.registration_opens_at/registration_closes_at` 對 `now()` 的關係。`resubmit_registration()`(退回後重新送出報名,語意上等同「再報名一次」)套用同一條規則。
- **投稿**:`submit_entry()`(`create or replace`,簽章跟上一版完全一致,不會產生重載——ADR-0018 踩過的坑這裡刻意避開)在既有的 `allows_new_submissions` 檢查之後,加上 `submission_opens_at`/`submission_closes_at` 對 `now()` 的檢查。原本形同虛設的 `allows_new_submissions` 檢查保留(不影響行為,拿掉它是另一件事,不在這次範圍內)。

`toFriendlyError()` 在 `register/actions.ts`(42501 + 「registration window is closed」)跟 `submit/actions.ts`(「submissions have not opened yet」/「submission window has closed」)補上對應的友善訊息,不讓使用者看到原始 DB 錯誤。

## SA-001 修法:Judge 匿名性收進 DB 邊界

新增 `20260822020000_judge_anonymity_db_boundary.sql`(+ 後續的型別修正,見下):

RLS 是列級不是欄位級,沒辦法「這幾欄給 review、那幾欄給 judge」。修法是把 `registrations`/`submissions` 的 `readable by organizer or collaborator` policy 收窄成只留 `review` 權限(這是 `/admin/review` 比對 Suno 帳號的合法需求),`judge` 權限改成透過新的 `judge_submissions_for_round(p_round_id)` SECURITY DEFINER RPC 拿資料——只回傳 `submission_id`/`title`/`registration_id`/`registration_status` 四個欄位,不含任何身份資訊。`judge/page.tsx` 改成呼叫這支 RPC,不再用 `submissions(...).select("...registrations(id,status)")` 的 embed 查詢。

這個改動不影響「主辦人本人」——`can_manage_competition()` 對真正的 Organizer(`is_competition_organizer()` 為真)一律放行,跟傳入哪個 permission 字串無關,收窄的只有「單純被邀請、只給了 judge 權限、沒有 review 權限」的協作者這一種角色。也確認過 `/judge` 目前沒有任何播放功能(`JudgeBoard` 沒接 `PlayerBar`),收窄 `submissions` 的 judge 讀取權限不會讓現有功能變壞。

**過程中抓到一個真的 bug**:第一版 `judge_submissions_for_round()` 用 `RETURN QUERY select ... r.status ...`,而 `registrations.status` 實際型別是自訂 enum `participant_status`,不是宣告的 `text`——PL/pgSQL 的 `RETURN QUERY` 要求查詢欄位型別跟宣告的 `RETURNS TABLE` 完全一致,執行時噴 `structure of query does not match function result type`。這是真實 PoC 跑出來的,不是憑空猜的。因為前一個 migration 已經 push 過,依照 session 的「已推送 migration 不可編輯」規則,用新的 `20260822030000_fix_judge_rpc_type_mismatch.sql` forward-fix(加 `r.status::text` 顯式轉型),沒有回頭改已推送的檔案。

## 真實 PoC 驗證(9/9 通過)

用 5 個一次性測試帳號(organizer / judge-only collaborator / review collaborator / participant / participant2)+ 真實 Supabase Auth session(password sign-in,不是 service_role 偽造)對正式站跑了 9 項檢查:

- SA-001a:judge-only 協作者直接查 `registrations` 拿不到任何列。
- SA-001b:同一個帳號呼叫 `judge_submissions_for_round()` 正常拿到匿名安全資料。
- SA-001c/d(回歸):review 權限協作者跟主辦人本人仍然看得到完整身份——確認修復沒有連帶砍掉合法用途。
- SA-002a/b:報名截止後 insert 被拒(42501)、開放時正常成功。
- SA-002c/d/e:投稿截止後 `submit_entry()` 被拒、開放時成功、且用獨立的 service_role 查詢複查那筆投稿真的落地在 DB(不只是 RPC 回傳的假象)。

**過程中兩次自己的測試腳本先出包,都如實記錄、修正後才重跑**:(1)`competition_collaborators` 的 batch insert 兩列物件 key 不對齊,PostgREST 把沒帶到的欄位當明確 NULL 送進去撞到 NOT NULL constraint,不是 default 生效——修法是每一列都把四個 boolean 欄位帶滿;(2)SA-002 的投稿截止測試一開始跟 SA-001 的測試共用同一個 round,撞到 `submissions_round_id_registration_id_key` unique constraint,是測試設計問題不是修復的 bug——改成用獨立的第二輪測試。

`tsc`/`eslint`/`build` 全程乾淨(eslint 剩 2 個跟本次改動無關的既有警告)。

## 複查結果總覽(這輪沒有動手的部分)

| ID | 嚴重度 | 複查結果 | 這輪處理 |
|---|---|---|---|
| SA-001 | P1 | 確認屬實 | **已修復** |
| SA-002 | P1 | 確認屬實(投稿端比報告寫的更嚴重) | **已修復** |
| SA-003 | P1 | 確認屬實(上傳簽章沒綁 ContentLength) | 未處理,規模較大(需要 provisional upload 生命週期 + 新表) |
| SA-004 | P1 | 確認屬實(CI 只有 eslint+build) | 未處理,規模較大(完整安全回歸測試矩陣) |
| SA-006 | P2 | 確認屬實(cron 刪除失敗仍丟棄 key) | 未處理 |
| SA-007 | P2 | 確認屬實(score 寫入沒驗證 score_item 對應關係) | 未處理 |
| SA-008 | P2 | 確認屬實(建立比賽非原子操作) | 未處理 |
| SA-009 | P2 | 確認屬實(Switch 缺 accessible 語義) | 未處理 |
| SA-011 | P2 | 只查得到本機 config,跟報告一樣標 Unable to Verify | 未處理 |
| SA-013 | P3 | 確認屬實(OAuth 完成後導回首頁) | 未處理 |
| SA-005/010/012 | P2 | 屬結構性/文件性觀察,與本 session 既有認知一致 | 未逐項複查 code,判斷合理 |
