# 報名新增審核關卡(RegistrationReviewStatus),防範惡意報名

08-19 這輪使用者提出:「報名這條路,首先想到要杜絕比賽蟑螂,由主辦人審核,一般來說都是報名即可,但想加退回並給理由」。原本的設計是「送出報名表單 = 立刻報名成功,可以投稿」,沒有任何審核關卡——任何人都能無限制報名任何公開比賽。使用者要加一層人工審核,退回時要給理由。

用 `AskUserQuestion` 問清楚三個分岔(不是自己猜):

1. **退回後可否重新報名?** → 可以,不限次數。
2. **退回理由要不要顯示給本人看?** → 要,跟 Submission 的退回理由(`review_note`)同一套精神。
3. **審核時機?** → 即時審核,跟 Submission 的審核流程一樣(送出後立刻進待審核,Organizer 隨時可以處理,不是報名截止後才一次批次處理)。

## Considered Options

- **方案 A(採用)**:新增獨立的 `RegistrationReviewStatus` 狀態機(`pending_review` / `approved` / `rejected`),跟既有的 `registrations.status`(`active`/`eliminated`,淘汰用)完全分開,不共用同一個欄位。理由:這是報名生命週期裡兩個獨立的維度——一個是「能不能開始參賽」,一個是「開始參賽後,比賽進行中還活不活著」,合併成同一個 enum 會讓「審核通過但還沒開始比賽」這個狀態無處安放。
- **方案 B**:把 `pending_review`/`rejected` 塞進既有的 `status` 欄位,跟 `active`/`eliminated` 混在一起——已否決,這正是 CONTEXT.md「Registration」詞條這輪特別註記要避免的混淆。
- **重新報名的實作方式**:選擇「編輯既有的 Registration 列、重新送審」,不是「刪除舊列、新建一列」——因為 `registrations` 對 `(competition_id, user_id)` 有 unique constraint,「刪除重建」會製造沒有必要的資料流失(投稿如果已經因為報名被退回而連帶清掉,重報名後找不回關聯),編輯回寫比較單純安全。

## Consequences

- **只有 `review_status = 'approved'` 的 Registration 才能投稿**——`/submit` 頁選單原本只檢查「有沒有報名」,現在要多加這個條件。這是這次改動裡影響既有投稿流程的部分,值得之後測試時特別留意。
- Organizer 審核入口併進既有的「審核後台」(`/admin/review`),跟投稿審核放在同一頁分兩個區塊,不另開新的管理頁面——理由是兩者都是「Organizer 的待審核收件匣」性質一致,沒有必要拆成兩個入口增加導覽負擔。
- 退回後允許無限次重新報名,這輪沒有做任何防灌水的節流機制(例如限制重報名次數或加冷卻時間)——如果之後真的觀察到有人利用「退回可以無限重報」反覆騷擾主辦,再回來加限制,不在這輪先發明沒被要求的規則。
