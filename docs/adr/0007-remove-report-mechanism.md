# 移除 Report 檢舉機制,推翻 ADR-0002 這一條

`ADR-0002` 當初的理由是「開放建立若無回報管道,PlatformAdmin 無從得知要處理什麼比賽濫用」,所以新增了 Report 機制:任何使用者可以檢舉某場 Competition,進 PlatformAdmin 的處理清單。08-19 這輪把「檢舉此比賽」UI 實作出來(補完之前一直是假裝成功的 UI)後,使用者立刻反饋「為什麼要檢舉比賽,這個移除」——確認後這是明確的產品範圍縮減,不是誤會:目前平台規模小、沒有真人是 PlatformAdmin,這個回報管道的必要性還沒出現,先拿掉,需要的話之後可以重新設計。

## Considered Options

- **方案 A(採用)**:整個拿掉 Report——刪除 `ReportButton` UI(已於前一輪完成)、刪除 `reports` 資料表與其 RLS policy、CONTEXT.md 的 Report 詞條移除、PlatformAdmin 的職責描述拿掉「處理 Report」這一項。
- **方案 B**:只藏 UI,保留資料表/RLS 不動——已否決,使用者的用詞是「移除」,不是「先不要」,而且留著一張沒有任何寫入路徑會用到的表跟三條政策,本身就是這次技術債掃描想清掉的那種半吊子狀態,不應該用「移除」去製造新的半吊子狀態。

## Consequences

- PlatformAdmin 這個角色現在沒有站內建置的正式回報管道——如果之後真的需要跨比賽爭議處理,要嘛重新設計 Report(可以參考這次的實作),要嘛走站外管道(email/客服)。這個角色目前的存在意義主要剩「看得到全站所有 Competition」。
- `report_status` 這個 enum type(`pending`/`resolved`/`dismissed`)跟著 `reports` 表一起砍掉。
- `AdminShell` 的「PlatformAdmin 視角 → 檢舉處理」畫面(`platform-reports`)跟著整個拿掉,`MOCK_REPORTS` 這個假資料常數也一起清掉。「全站比賽」(`platform-competitions`)那半邊維持不變,是獨立功能。
