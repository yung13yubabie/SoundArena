# 從單一主辦轉為開放多租戶平台

> **「Organization 明確不做」這一條已被 [ADR-0003](./0003-collaborator-tiered-permissions.md) 推翻;「Report 機制」這一條已被 [ADR-0007](./0007-remove-report-mechanism.md) 推翻**——其餘決定(開放自建、兩層權限)仍然有效,不受影響。

SPEC.md 初版假設 SoundArena 是站方自己主辦比賽的網站,審核後台/賽制建立/時程設定都是單一「管理員」角色在用。實測競品 songcontest.ai(同類 AI 音樂比賽平台)後發現其為開放平台——任何使用者都能自建比賽(「Organize a Contest」)、有自己的比賽管理後台(「My Contests」)、有比賽瀏覽/發現頁。經與使用者確認,SoundArena 改採同樣定位:任何登入使用者可自由建立 Competition 並成為其 Organizer,不設審核門檻(先求覆蓋率,濫用問題留給第二層機制處理)。

隨之而來的必要變更:
- 權限分兩層——Organizer 只管自己建立的 Competition;PlatformAdmin 看得到全站、處理 Report(見 CONTEXT.md)
- 新增 Report 機制,讓使用者能把濫用比賽回報給 PlatformAdmin(開放建立若無回報管道,PlatformAdmin 無從得知要處理什麼)
- 首頁從佔位頁升級為 Competition Discovery(瀏覽/篩選頁),否則其他使用者建立的比賽無人能發現
- Organization(多人共管比賽)**明確不做**——「一場比賽 = 一位 Organizer」在現階段已足夠,多人協作留待真的有需求時再加,避免現在就承擔額外的權限複雜度

## Considered Options

- **方案 A(採用)**:開放多租戶,自由建立 + 兩層權限 + Report 機制
- **方案 B**:維持單一主辦(原始假設)——實作最簡單,但比賽只有站方能開,不符合使用者確認後的產品方向,已否決
- **方案 C**:開放建立但需審核/申請才能成為 Organizer——能控制品質,但在尚未真的出現濫用問題前先增加開發與使用者的申請摩擦,決定先用方案 A、真的有濫用問題再收斂
</content>
