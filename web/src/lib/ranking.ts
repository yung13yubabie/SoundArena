export interface RankableScoreItem {
  id: string;
  kind: "weighted" | "bonus";
  weightPercent: number | null;
}

export interface RankableSubmission {
  id: string;
  values: Record<string, number>;
}

export interface RankResult {
  id: string;
  weightedSubtotal: number;
  bonusTotal: number;
  total: number;
}

// SPEC.md 第8節只規定「加權項目權重總和必須100%」跟「公式必須公開」,沒有規定精確算法。
// 這裡採用的公式(這輪自訂、有記錄,不是憑空假設):每個加權項目先在本輪所有作品中正規化
// (該作品數值 ÷ 本輪最高值 × 100),再乘以權重相加,得出 0–100 的加權小計;額外加分項
// 直接加總疊上去,不受 100% 封頂。/judge 與公開結果頁共用這份計算,避免兩邊算法各自漂移。
export function computeRanking(items: RankableScoreItem[], subs: RankableSubmission[]): RankResult[] {
  const weighted = items.filter((i) => i.kind === "weighted");
  const bonus = items.filter((i) => i.kind === "bonus");

  const maxByItem = new Map<string, number>();
  for (const item of weighted) {
    const max = Math.max(0, ...subs.map((s) => s.values[item.id] ?? 0));
    maxByItem.set(item.id, max);
  }

  return subs.map((s) => {
    let weightedSubtotal = 0;
    for (const item of weighted) {
      const max = maxByItem.get(item.id) ?? 0;
      const normalized = max > 0 ? ((s.values[item.id] ?? 0) / max) * 100 : 0;
      weightedSubtotal += normalized * ((item.weightPercent ?? 0) / 100);
    }
    let bonusTotal = 0;
    for (const item of bonus) {
      bonusTotal += s.values[item.id] ?? 0;
    }
    return { id: s.id, weightedSubtotal, bonusTotal, total: weightedSubtotal + bonusTotal };
  });
}

export function rankOf(submissionId: string, results: RankResult[]): number {
  const sorted = [...results].sort((a, b) => b.total - a.total);
  return sorted.findIndex((r) => r.id === submissionId) + 1;
}
