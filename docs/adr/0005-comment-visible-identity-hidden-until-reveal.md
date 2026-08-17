# 留言在匿名期就能公開,身份才是延後揭露的東西

修正 [ADR-0004](./0004-comment-endorsement-scoring.md) 的一條假設:原本整個 Comment 功能(讀取、留言、認可)都被「該輪身份是否已揭露」擋住,理由是怕在匿名投票階段造成偏見。使用者確認這樣太保守——留言內容跟認可度本來就該隨時可見(甚至希望在使用者自己的個人狀態頁、投票紀錄旁邊就能看到),真正該延後揭露的只有「這則留言是誰寫的」。改為:只要該場 Competition 是公開的,任何時候都能讀留言、寫留言、原作認可;**留言者身份**(commenter 的 display_name)則沿用既有的 `round_identity_revealed()` 規則,揭露前一律回傳 null——連原作自己審核要不要認可時也一樣看不到,不開特例,理由是這樣才真的做到「評分/認可不受身份影響」,跟 JudgeBoard 對主辦本人也一律顯示「匿名作品 #」的既有精神一致,不是留言功能自己另立一套標準。

## Consequences

- `comments` 表的原始 `commenter_id` 欄位不開放任何人直接讀(欄位級 REVOKE,包含 Organizer/Collaborator),一律透過 `get_submission_comments()` 這個 function 讀,身份是否顯示由 function 內部依 `round_identity_revealed()` 決定,留言者自己一定看得到「這是我寫的」(不管揭不揭露),避免使用者自己都認不出自己的留言
- 這條決策不影響 ADR-0004 的另一半(加分算在留言者自己那輪的投稿上、WeightedScoreItem、建議權重 ≤5%)——那部分維持不變,使用者這輪也明確重新確認過
