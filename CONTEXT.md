# 聲擂 SoundArena

音樂比賽投票網站的核心領域詞彙。本檔案只放詞彙定義與關係,不放介面/實作細節——那些留在 SPEC.md。

## Language

**Competition(賽事 / 比賽)**:
由一位 Organizer 建立的一場完整比賽外框,是一串有序 Round 的容器,擁有名稱、預設 ScoringRule、整體時程、公開狀態(是否出現在 Discovery 頁)。第一個 Round 固定是「初賽」、最後一個固定是「決賽」,中間的 Round 數量與內容由 Organizer 自訂。SoundArena 是開放多租戶平台(見下方 ADR-0002):任何登入使用者都能自由建立 Competition 並成為其 Organizer,不需要平台審核。匿名揭露不再是 Competition 層級的屬性,見 Round / AnonymityMode(ADR-0006)。
_Avoid_: 賽制(這個詞專指 FormatBlock 組合,不是比賽本身;混用會搞不清楚「建立一場賽事」跟「設定一輪賽制」是兩件事)

**Organizer(主辦者)**:
建立了至少一場 Competition 的使用者,是該 Competition 的擁有者(ownership),對自己建立的 Competition(們)有完整管理權限(審核投稿、設定賽制、設定時程、評審評分、邀請 Collaborator),權限範圍僅限於自己建立的 Competition,看不到、也管不到其他 Organizer 的比賽。任何登入使用者建立第一場 Competition 的當下就自動成為 Organizer,沒有額外的申請或審核步驟(唯一的前置動作是完成一次性的主辦人身分檔案設定,自助完成,不用等誰核准)。一場 Competition 永遠只有一位 Organizer,ownership 目前不可轉讓(見 Collaborator)。個人檔案頁的「主辦過 N 場比賽」只計算 Organizer 身分,不計 Collaborator。
_Avoid_: 管理員(不夠精確,容易跟 PlatformAdmin 搞混,兩者權限範圍完全不同)

**Collaborator(協作者)**:
被某場 Competition 的 Organizer 邀請、協助管理該場比賽的使用者(見 ADR-0003)。Collaborator 不是 Organizer,不擁有比賽,只被授予 Organizer 個別勾選的權限子集(審核投稿 / 賽制建立 / 時程設定 / 評審評分 / 邀請其他 Collaborator 這五項,各自獨立開關,不是全有或全無)。「邀請其他 Collaborator」本身也是一項可授予的權限,預設只有 Organizer 擁有。
_Avoid_: 副主辦、管理員(這兩個詞暗示對等權限,容易誤導成方案 B「完全對等」,已在 ADR-0003 否決)

**Comment(留言)**:
任一登入使用者對某個 Submission 留下的文字回饋,只要該 Submission 所屬 Competition 是公開的就能讀、能寫,不受該 Round 是否匿名影響(見 ADR-0005)。不能對自己的作品留言(呼應 Vote 的「不能投自己」規則)。延後揭露的是「這則留言是誰寫的」,不是留言本身能不能看見——見 CommentEndorsement。
_待確認_:留言本身要不要有審核/檢舉機制(例如惡意留言)——這輪沒有展開,先當作跟 Submission 審核無關的獨立功能。

**CommentEndorsement(留言認可度)**:
Submission 的原作者對一則 Comment 給予的 0–100% 認可度(預設 0%,未認可),只有原作者本人能設定,Organizer 不能代為認可。原作審核要不要認可時,**看不到留言者是誰**(除非該輪身份已揭露,或留言者就是原作自己)——刻意跟 JudgeBoard 對評審隱藏身份同一套精神,避免認可決定被人情/面子影響。留言者當輪若同時是本輪的 Participant 且有通過審核的 Submission,會依認可度取得加分,計入該輪的 WeightedScoreItem(見 ADR-0004,不是不設上限的 BonusScoreItem)。留言者若當輪沒有投稿,留言/認可仍可進行,但沒有分數可加。
_Avoid_: 按讚、愛心(這兩個詞暗示二元的是非,實際上是連續的 0–100% 槓桿,只是 UI 上可能提供「一鍵設 100%」的捷徑)

**PlatformAdmin(平台管理員)**:
與 Organizer 不同層級的角色,看得到全站所有 Competition,職責是排解跨比賽的爭議/濫用。不是自助開放的角色,由平台方手動指派(指派機制不在本輪範圍內展開)。
_已移除(ADR-0007)_:原本規劃「處理 Report(檢舉)」是這個角色的職責之一,ADR-0007 推翻了 Report 機制本身,PlatformAdmin 的爭議處理現在沒有站內的正式回報管道支撐——這是使用者明確要求拿掉的,不是遺漏。

**Round(輪次)**:
Competition 裡一個有序的階段(如「第1輪·海選」「第2輪·複賽」「決賽」)。FormatBlock 組合掛在 Round 上,不是掛在 Competition 上——同一場 Competition 底下,不同 Round 可以是完全不同的賽制組合(例如第1輪循環賽、第2輪3對3隊伍賽、決賽單挑對戰)。ScoringRule 預設繼承 Competition 的設定,但可以在 Round 層級被 ScoringRuleOverride 取代。是否匿名(AnonymityMode)也是 Round 自己的屬性,不是繼承 Competition。
_Avoid_: 場次(跟 Round 同義但不夠精確,容易跟 Competition 搞混)

**FormatBlock(賽制積木)**:
可組合的原子規則單元,分三類:淘汰方式(單敗/雙敗/循環賽/月度累積)、分組方式(個人/隊伍/抽籤)、特殊機制(敗部復活/限定主題輪/導師制)。一個 Round 由若干 FormatBlock 組成。
_Avoid_: 賽制(這個詞在 SPEC.md 舊版泛指整套系統,精確用法應該拆成 FormatBlock 積木本身 + FormatTemplate 範本)

**FormatTemplate(賽制範本)**:
預先組好、可一鍵套用到 Round 上的 FormatBlock 固定組合(例如「雙敗淘汰範本」「3對3隊伍賽範本」)。範本庫走豐富預建路線,主辦仍可在範本之外自行客製 Round 的 FormatBlock 組合,不強制套用範本。

**ScoringRule(評分規則)**:
一組 ScoreItem 的集合 + 計算公式,決定 Round 裡的投稿如何排名。存在兩個層級:Competition 的預設 ScoringRule(套用到未特別設定的所有 Round),以及個別 Round 的 ScoringRuleOverride(取代該輪的預設,用於例如限定主題輪需要啟用「關鍵字符合加分」這種只有該輪才有意義的項目)。

**ScoreItem(計分項目)**:
ScoringRule 底下的單一計分來源,分兩種性質:
- **WeightedScoreItem(加權計分項目)**:計入排名,同一個 ScoringRule 底下所有 WeightedScoreItem 的權重總和固定要等於 100%(硬性規則,主辦設定時系統即時檢查)
- **BonusScoreItem(額外加分項目)**:不受 100% 限制,直接加總在加權小計之上(例如魔王加給)

範本庫項目:投票(系統自動)、外部投票(主辦匯入)、影片流量(系統排程抓取)、關鍵字/主題符合加分(系統文字比對,可能需人工確認邊界)、魔王加給(人工輸入,通常是 BonusScoreItem)、留言認可加分(見 CommentEndorsement,系統依 CommentEndorsement 自動加總,是 WeightedScoreItem 不是 BonusScoreItem,建議權重 ≤5%)。
_待確認_:「魔王加給」目前假設任何持有「內容評分」權限的人都能填,還沒確認要不要限定給特定的嘉賓/導師評審才能操作——非阻塞,先當通用評分權限處理,之後要收斂再改。

**Participant(參賽者)**:
完成 Registration 的使用者,綁定一個站內帳號 + 一組 Suno 帳號名稱。

**ParticipantStatus(參賽者狀態)**:
Participant 在某個 Competition 底下的存活狀態(active / eliminated)。一旦在某 Round 被淘汰,後續 Round 只保留投票資格,不能再建立新的 Submission——這條規則掛在 ParticipantStatus 上,不是掛在 Round 或 Competition 上。

**Submission(投稿)**:
一個 Participant 對某個 Round 提交的一次作品,包含 Suno 分享連結、上傳音檔、歌詞、是否「允許公開展示」標記(供 Discovery 頁的公開試聽功能使用,預設關閉,Participant 投稿時自選)。每個 Round 都要重新投稿,不是投一次沿用全場。生命週期(狀態機):
```
草稿(Draft)
  → 身份比對中(IdentityChecking)
    → 身份比對通過(IdentityMatched) → 待人工審核(PendingReview)
    → 身份比對不通過(IdentityMismatched)
        → [該 Competition 的 Organizer 人工放行] → 待人工審核(PendingReview)
        → [投稿者更正重新送出] → 回到「草稿」重新走一次
  → 待人工審核(PendingReview)
    → 通過(Approved) → 自動掛入該 Round 的歌曲清單
    → 退回(Rejected)
```
「身份比對」是自動比對 sharer_handle;「人工審核」除了看身份比對結果,還包含「不公開設定」檢查等內容審核項目——這是兩個不同性質的關卡,合在同一個 Submission 狀態機裡走,但檢查者跟檢查內容不一樣。審核者是該 Submission 所屬 Competition 的 Organizer,不是 PlatformAdmin。

**AnonymityMode(匿名揭露模式)**:
Round 層級的布林設定(是/否匿名),不再是 Competition 層級的三選一(舊設計已被 ADR-0006 推翻)。標記匿名的 Round,投稿者身份在該輪投票截止前一律隱藏,投票一截止就公開該輪身份;沒標記匿名的 Round 從一開始就公開。Competition 建立/設定頁提供一個「全部套用」的批次動作,一次把所有 Round 設成同一個值,設定完仍可針對個別 Round 再調整——但那是 UI 層的便利功能,不是獨立的資料層概念。
_Avoid_: 匿名規則(不夠精確,實際上是揭露「時機」的選擇,不是有沒有匿名這個二元問題);全程匿名/單輪匿名/全程公開(舊三選一模式的用詞,新模型底下不再適用,只保留「這輪匿名與否」)

**SchedulePhase(時程階段)**:
Competition 的高層階段骨架:宣傳 → 投稿 → 投票 → 公布,通常對應到 Round 的起訖日期。跨階段有邊界規則:報名開放時間不可晚於投稿期結束(見 Registration)。

**Registration(報名)**:
Participant 建立資格的動作,綁定站內帳號與 Suno 帳號名稱。存取順序是硬性的:未登入不能報名,未報名不能投稿(登入 → 報名 → 投稿,不可跳過)。ADR-0008 之後,「報名成功」不再等於「可以投稿」,中間多了 RegistrationReviewStatus 這一關。

**RegistrationReviewStatus(報名審核狀態)**:
Registration 送出後的審核狀態,防範惡意/灌水報名(使用者原話:比賽蟑螂)。狀態機:
```
待審核(PendingReview)
  → 已通過(Approved) → 可以投稿(見 Submission)
  → 已退回(Rejected,附退回理由,顯示給本人看)
      → [本人修改暱稱/Suno帳號重新送出] → 回到「待審核」,次數不限
```
審核者是該 Competition 的 Organizer(或有 review 權限的 Collaborator),跟 Submission 的審核者、審核精神一致(退回要附理由、理由要讓本人看得到)——這條規則刻意比照 Submission 的審核狀態機設計,不是重新發明一套。
_Avoid_: 跟 ParticipantStatus(active/eliminated)混為一談——ParticipantStatus 是「審核通過、正式參賽後,比賽進行中的存活狀態」;RegistrationReviewStatus 是「審核通過之前,能不能開始參賽」的關卡。這是報名生命週期裡兩個獨立的狀態維度,不是同一個欄位的不同值,順序上 RegistrationReviewStatus 先發生。

## 已收斂的舊疑問

**Event(活動)**——**收斂為 Competition Discovery,不另立實體**:
上一輪記錄過「活動」跟「比賽」在 Lovable 雛形導覽列裡是分開的兩個詞,當時不確定是否要另立 Event 實體。這輪定案:SoundArena 開放多租戶後,首頁/「活動」頁直接升級成 Competition 的瀏覽/發現頁(可篩選、看到所有 Organizer 建立的 Competition),不另外做一個更廣義的 Event 實體——「活動」是 UI 上的頁面名稱,底層資料就是 Competition 列表。
