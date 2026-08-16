# FormatBlock 與 ScoringRule 掛在 Round 上,不是掛在 Competition 上

SPEC.md 第 7、8 節原本的文字讀起來像是「建立比賽時選一次賽制積木組合」,套用在整場 Competition。但實際需求是同一場 Competition 底下,不同 Round 可以是完全不同的賽制(例如第1輪循環賽、第2輪3對3隊伍賽、決賽單挑對戰),限定主題輪也只在特定 Round 才有意義。因此決定:FormatBlock 組合掛在 Round 上;ScoringRule 則採「Competition 設一個預設值,Round 可選擇性覆寫」——多數比賽全程用同一套評分公式,只有需要的 Round(如限定主題輪要啟用關鍵字加分)才個別覆寫。

## Considered Options

- **方案 A(採用)**:FormatBlock 掛 Round、ScoringRule 走「Competition 預設 + Round 覆寫」
- **方案 B**:FormatBlock 與 ScoringRule 都固定在 Competition 層級,全場一致——實作最簡單,但無法支援跨輪次不同賽制/不同計分項目的需求,被明確否決
