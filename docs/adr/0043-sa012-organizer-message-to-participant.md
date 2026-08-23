# ADR-0043:SA-012 追加需求——後台直接對參賽者發 Discord/Email 訊息

原本以為「SA-012 主動 alert」是要幫其他主辦人聯繫到我(平台管理員),使用者澄清實際需求是相反方向:**主辦人**要能在後台直接對**參賽者**發訊息,不透過平台管理員轉達。

## 設計

不弱化既有的 `create_notification_event()`(ADR-0015 刻意鎖死呼叫端不能傳任意內容,防止被當釣魚管道),開一支獨立的 `create_organizer_message_event(p_registration_id, p_message)` RPC,範圍收窄:

- 只有對這場比賽有 `review` 權限的人(主辦人或協作者,跟審核投稿身份用同一套判斷)能呼叫。
- 對象只能是這場比賽底下真實存在的報名者,不能對任意 `user_id` 發送。
- 尊重既有的訂閱設計(SPEC.md 第6節)——參賽者已取消這場比賽的通知訂閱時明確報錯,不讓主辦人手動繞過。
- 沒有支援的登入方式(目前只有 Google/Discord 能收通知)明確報錯,不是靜默失敗。
- 沿用既有的 3 秒防洗版 advisory lock(跟 `create_notification_event()` 同一套)。

跟 `submitEntry()`/`registerForCompetition()` 同一套「立即嘗試發送,失敗留給每日 cron 兜底」模式(見 `lib/notifications.ts` 的 `dispatchNotificationEvent()`,直接重用,不重寫)。

**UI**:`/admin/review` 新增「參賽者名單」區塊(`ParticipantRoster.tsx`)——只列已核准報名的參賽者(pending 的在上面審核清單處理),每人顯示已投稿輪次數/總輪次數,搭配「傳訊息」按鈕展開輸入框。這個名單同時滿足待辦清單第 3 項(後台已投稿/未投稿名單),沒有另外重做一份。

## 驗證

真實 PoC(7/7,對正式 Supabase 環境 + 你的真實 Discord 帳號):陌生人不能對別人比賽的參賽者發訊息、已取消訂閱的參賽者不能被發、沒有支援登入方式的參賽者不能被發、空白訊息被拒絕、主辦人可以正常發送、事件正確標記、訊息真的送達 Discord(使用者確認收到)。`security-regression.mjs` 新增 3 項長期守護,36/36 通過。`tsc`/`eslint`/`build` 全程乾淨。
