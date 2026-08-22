# ADR-0037:DB-05——後台幾個固定寬度 grid 在窄螢幕下會溢位/擠壓

第二輪第三方稽核報告點名 Format/Schedule/Review 幾個管理頁面用固定 px 寬度的 CSS grid,手機寬度下會出問題。查證後確認具體、可測量的溢位:

- `ScheduleForm.tsx`:`grid-cols-[140px_1fr_1fr]`(每個時程階段一列)。
- `ReviewQueue.tsx`:`grid-cols-[1fr_140px_220px]`——140+220=360px 固定欄位,扣掉頁面/卡片 padding 後在 375px 寬的手機上幾乎沒有空間留給最左邊的 1fr 標題欄。
- `RegistrationReviewQueue.tsx`:`grid-cols-[1fr_220px]`,同樣問題但欄位少一個。
- `AdminFormatClient.tsx` 的計分項目清單:`grid-cols-[1fr_110px_90px_90px_32px]`——110+90+90+32=322px 固定欄位 + 4 個 gap,扣掉頁面/卡片 padding 後在手機上一定溢位。

`ProfileForm.tsx`(`grid grid-cols-1 md:grid-cols-[1fr_300px]`)跟 `SubmitForm.tsx` 已經在用「手機單欄、`md:` 斷點才套用固定欄寬」這個慣例,只是沒有套用到上面四個檔案——這是遺漏,不是刻意的設計差異。

## 修法

`ScheduleForm.tsx`、`ReviewQueue.tsx`、`RegistrationReviewQueue.tsx`:比照 `ProfileForm.tsx` 已經在用的慣例,改成 `grid-cols-1 ... md:grid-cols-[...]`——手機上每一列的欄位垂直堆疊,`md:` 以上才變回原本的固定寬度多欄佈局。`ReviewQueue.tsx`/`RegistrationReviewQueue.tsx` 的欄位標題列(投稿／身份比對／操作)在手機上用 `hidden md:grid` 隱藏——堆疊後每張卡片本身內容已經自我說明,不需要額外的欄位標題。

`AdminFormatClient.tsx` 的計分項目清單:5 欄裡有 4 欄是緊密相關的控制項(下拉選單+數字輸入+「%」+移除按鈕),沒辦法簡單堆成單欄而不影響操作邏輯,重新設計這組控制項的手機排版需要實際畫面反覆調整,不是照抄既有慣例能做完的事。改用比較保守、風險更低的作法:外層包一個 `overflow-x-auto` + `min-w-[420px]`,保持原本的固定欄位佈局不變,但手機上會在這個容器內水平捲動,不會把版面撐開、也不會壓縮到不能用——跟 `AdminShell.tsx` 既有的全站比賽表格用的是同一套已驗證過的容器化捲動手法(`overflow-x-auto` + `min-w-[...]`)。

## 驗證方式的限制,誠實記錄

這個開發環境裡 `claude-in-chrome` 的 `resize_window` 工具已經在本 session 稍早確認過不會真的改變畫面渲染尺寸,沒有可靠方式在這裡用真實行動裝置寬度做視覺驗證。這批修改是照專案裡已經驗證過在用的響應式慣例(`ProfileForm.tsx`/`SubmitForm.tsx` 的 `grid-cols-1 md:...`、`AdminShell.tsx` 的 `overflow-x-auto` 表格)機械套用,`tsc`/`eslint`/`build` 全程乾淨,但**沒有**在真實手機寬度下親眼確認渲染結果——請實際用手機或瀏覽器開發者工具的裝置模擬檢查一次。
