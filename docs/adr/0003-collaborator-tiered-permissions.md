# 開放比賽協作者,分級權限,推翻 ADR-0002 的「明確不做」

ADR-0002 當初明確排除「Organization(多人共管比賽)」,理由是「一場比賽 = 一位 Organizer」已足夠、且不想在還沒出現需求時就承擔額外的權限複雜度。這輪使用者確認真的有需求了(找人一起管理比賽),所以正式推翻該決定的這一條,改為:一場 Competition 仍然只有一位 Organizer(擁有者,ownership 不變、不可轉讓),但 Organizer 可以邀請任意數量的 Collaborator(協作者),並為每位 Collaborator 個別勾選能碰哪些後台功能(審核投稿 / 賽制建立 / 時程設定 / 評審評分 / 邀請其他協作者),不是全有或全無。

## Considered Options

- **方案 A(採用)**:分級權限——Organizer 自訂每位 Collaborator 的權限清單,風險可控,符合 ADR-0002 當初「避免額外複雜度」的顧慮(複雜度是有,但範圍由 Organizer 自己收斂)
- **方案 B**:完全對等——Collaborator 能做 Organizer 能做的所有事,實作最簡單,但單一帳號被盜或惡意協作者可以整場比賽連坐,風險過高,已否決
- **方案 C**:唯讀共享——Collaborator 只能看不能改,最安全但不滿足「協作」的實際需求(使用者要的是真的能幫忙做事,不是只能旁觀),已否決

## Consequences

- `profiles` 個人檔案的「主辦過 N 場比賽」計數只算真正的 Organizer(擁有者),不算 Collaborator 身分——「主辦」跟「協作」是不同的信譽/身份主張,不應該混為一談
- 「邀請其他協作者」本身也是一項可被授予/收回的權限,預設只有 Organizer 本人擁有,避免 Collaborator 自行擴權
- 尚未決定 Organizer 能否把 ownership 轉移給某位 Collaborator——這輪不處理,留待真的有需求再議
