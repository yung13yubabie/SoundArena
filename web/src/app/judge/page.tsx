"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/lib/icons";
import { EmptyState } from "@/components/EmptyState";
import { PlayerBar } from "@/components/PlayerBar";

const WEIGHTED_ITEMS = [
  { key: "vote", label: "投票", raw: "128 票", weight: 0.4, contrib: 3.6 },
  { key: "video", label: "影片流量", raw: "4520 次觀看", weight: 0.25, contrib: 2.5 },
  { key: "keyword", label: "主題關鍵字符合", raw: "符合本輪限定主題", weight: 0.2, contrib: 2.0 },
  { key: "external", label: "外部投票", raw: "56 票", weight: 0.15, contrib: 0.9 },
];
const WEIGHT_SUM = WEIGHTED_ITEMS.reduce((s, i) => s + i.weight, 0); // 須為 1.00（100%），系統會擋不合法設定
const WEIGHTED_SUBTOTAL = WEIGHTED_ITEMS.reduce((s, i) => s + i.contrib, 0);

export default function JudgePage() {
  const [showFormula, setShowFormula] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [boss, setBoss] = useState(6);
  const total = WEIGHTED_SUBTOTAL + boss;

  return (
    <div>
      <SiteHeader authed active="judge" roleLabel="評審模式" />
      <div className="mx-auto max-w-[1180px] px-11 pt-10 pb-24">
        <div className="mb-7">
          <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 評審評分（角色：評審）</div>
          <h1 className="font-display text-[30px]">本輪待評分作品</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            為本輪投稿評分。加權項目的權重總和固定 100%，額外加分項另外累加，詳細算法可在下方展開查看。
          </p>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5 rounded-[11px] border border-warn/30 bg-warn/8 px-4 py-2.75 text-[12.5px] text-warn">
            <Icon name="shield" size={15} /> 你目前是「內容評分」角色，系統不會顯示任何投稿者身份線索
          </div>
          <button
            onClick={() => setShowEmpty(!showEmpty)}
            className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-ink"
          >
            {showEmpty ? "顯示範例資料" : "檢視空狀態"}
          </button>
        </div>

        {showEmpty ? (
          <EmptyState icon="inbox" title="目前沒有待評分作品" sub="等待本輪投稿審核完成後，待評分清單才會出現作品" />
        ) : (
          <>
            <div className="glass mb-3.5 pt-1.5">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">
                      加權計分項目（合計 {Math.round(WEIGHT_SUM * 100)}%）
                    </th>
                    <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">來源</th>
                    <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">數值</th>
                    <th className="px-3.5 py-2.25 text-left text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">權重</th>
                    <th className="px-3.5 py-2.25 text-right text-[10.5px] font-semibold tracking-wide text-ink-faint uppercase">貢獻分</th>
                  </tr>
                </thead>
                <tbody>
                  {WEIGHTED_ITEMS.map((item) => (
                    <tr key={item.key}>
                      <td className="border-t border-white/5 px-3.5 py-3 text-[13px]">
                        — 匿名作品 #03 — <br />
                        <span className="text-ink-dim">{item.label}</span>
                      </td>
                      <td className="border-t border-white/5 px-3.5 py-3">
                        <span className="rounded-full border border-[#8fb3d9]/35 bg-[#8fb3d9]/8 px-2.25 py-0.75 text-[11px] text-[#8fb3d9]">
                          系統自動
                        </span>
                      </td>
                      <td className="border-t border-white/5 px-3.5 py-3">{item.raw}</td>
                      <td className="border-t border-white/5 px-3.5 py-3">{Math.round(item.weight * 100)}%</td>
                      <td className="border-t border-white/5 px-3.5 py-3 text-right font-semibold text-ink">
                        {item.contrib.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-baseline justify-between px-3.5 pt-4 pb-1">
                <span className="text-[12.5px] text-ink-dim">加權小計（滿分 10）</span>
                <span className="font-display text-[18px] text-accent">{WEIGHTED_SUBTOTAL.toFixed(1)}</span>
              </div>
            </div>

            <div className="glass mb-4 px-4.5 py-3.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12.5px] text-ink-dim">額外加分項（不計入 100%，直接加總）</span>
                <span className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.25 py-0.75 text-[11px] text-accent">
                  <Icon name="crown" size={11} /> 人工輸入
                </span>
              </div>
              <div className="mb-2.5 text-[13px]">
                — 匿名作品 #03 — <span className="text-ink-dim">魔王加給</span>
              </div>
              <span className="flex items-center gap-2.5">
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={boss}
                  onChange={(e) => setBoss(Number(e.target.value))}
                  className="flex-1"
                />
                <b className="text-[15px]">+{boss}</b>
              </span>
            </div>

            <div className="flex items-baseline justify-between px-1 pt-0.5 pb-5">
              <span className="text-[13px] text-ink-dim">總分（加權小計 + 額外加分）</span>
              <span className="font-display text-[26px] text-accent">{total.toFixed(1)}</span>
            </div>

            <button
              onClick={() => setShowFormula(!showFormula)}
              className="text-[11.5px] text-accent underline underline-offset-3"
            >
              {showFormula ? "收起" : "查看"}計算方式（規格要求評分公式須公開透明）
            </button>
            {showFormula && (
              <div className="glass mt-3.5 px-4 py-3.5 text-[12px] leading-loose text-ink-dim">
                加權小計 = <code className="font-mono text-accent">投票 × 40%</code> +{" "}
                <code className="font-mono text-accent">影片流量 × 25%</code> +{" "}
                <code className="font-mono text-accent">主題關鍵字符合 × 20%</code> +{" "}
                <code className="font-mono text-accent">外部投票 × 15%</code>（權重總和固定 100%）
                <br />
                總分 = <code className="font-mono text-accent">加權小計</code> +{" "}
                <code className="font-mono text-accent">魔王加給</code>（額外加分項，不受 100% 限制，直接加總）
                <br />
                <span className="text-ink-faint">
                  此區塊為主辦方於「賽制建立」頁勾選啟用項目、設定權重後，系統自動生成的公開說明文字；未啟用的項目不會出現在公式裡。
                </span>
              </div>
            )}
          </>
        )}
        <PlayerBar />
      </div>
    </div>
  );
}
