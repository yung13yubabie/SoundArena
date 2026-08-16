"use client";

import { useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { Switch } from "@/components/Switch";
import { Icon } from "@/lib/icons";
import { FORMAT_BLOCKS, MOCK_COMPETITION } from "@/lib/mockData";

type Round = (typeof MOCK_COMPETITION.rounds)[number];
type BlockGroup = "elimination" | "grouping" | "special";

interface ScoreItem {
  key: string;
  label: string;
  kind: "weighted" | "bonus";
  weight: number;
}

function ScoreEditor({ context, extraItem = false }: { context: string; extraItem?: boolean }) {
  const base: ScoreItem[] = [
    { key: "vote", label: "投票", kind: "weighted", weight: 40 },
    { key: "video", label: "影片流量", kind: "weighted", weight: 25 },
    { key: "external", label: "外部投票", kind: "weighted", weight: 35 },
  ];
  const withExtra: ScoreItem[] = extraItem
    ? [...base.slice(0, 2), { key: "keyword", label: "主題關鍵字符合", kind: "weighted", weight: 20 }, { ...base[2], weight: 15 }]
    : base;
  const [items, setItems] = useState(withExtra);

  const setWeight = (key: string, w: number) => setItems((its) => its.map((it) => (it.key === key ? { ...it, weight: w } : it)));
  const setKind = (key: string, kind: ScoreItem["kind"]) =>
    setItems((its) => its.map((it) => (it.key === key ? { ...it, kind } : it)));
  const removeItem = (key: string) => setItems((its) => its.filter((it) => it.key !== key));

  const weightedItems = items.filter((i) => i.kind === "weighted");
  const weightedSum = weightedItems.reduce((s, i) => s + i.weight, 0);
  const sumOk = weightedItems.length === 0 || weightedSum === 100;

  return (
    <div className="glass mt-2 px-4 py-3.5">
      <div className="mb-2 text-[11.5px] text-ink-faint">{context}</div>
      {items.length === 0 && (
        <EmptyState icon="inbox" title="沒有啟用任何計分項目" sub="至少要保留一個項目，比賽才有分數可以排名" />
      )}
      {items.map((it) => (
        <div key={it.key} className="grid grid-cols-[1fr_110px_90px_90px_32px] items-center gap-2.5 py-2">
          <span className="text-[12.5px]">{it.label}</span>
          <select
            value={it.kind}
            onChange={(e) => setKind(it.key, e.target.value as ScoreItem["kind"])}
            className="w-full rounded-lg border border-panel-border bg-black/25 px-2.25 py-1.75 text-[12.5px] text-ink"
          >
            <option value="weighted">加權計分（計入100%）</option>
            <option value="bonus">額外加分（不封頂）</option>
          </select>
          <input
            type="number"
            min="0"
            max="100"
            value={it.weight}
            onChange={(e) => setWeight(it.key, Number(e.target.value))}
            disabled={it.kind !== "weighted"}
            className="w-full rounded-lg border border-panel-border bg-black/25 px-2.25 py-1.75 text-[12.5px] text-ink disabled:opacity-40"
          />
          <span className="text-[11px] text-ink-faint">%</span>
          <button title="移除此計分項目" onClick={() => removeItem(it.key)} className="text-ink-dim hover:text-ink">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      {weightedItems.length > 0 && (
        <div
          className={`mt-2.5 flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[12.5px] ${
            sumOk ? "border border-ok/30 bg-ok/8 text-ok" : "border border-bad/30 bg-bad/8 text-bad"
          }`}
        >
          <Icon name={sumOk ? "check" : "alert"} size={14} />
          加權計分項目權重總和：{weightedSum}%{sumOk ? "（符合規則）" : "（須恰好等於 100% 才能儲存）"}
        </div>
      )}
    </div>
  );
}

function RoundFormatCard({
  round,
  onToggleBlock,
  onToggleOverride,
  onRemove,
}: {
  round: Round;
  onToggleBlock: (roundId: string, group: BlockGroup, key: string) => void;
  onToggleOverride: (roundId: string) => void;
  onRemove: (roundId: string) => void;
}) {
  const isLocked = !!round.locked;
  return (
    <div className="glass mb-4 p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex-1 text-[15px] font-semibold">{round.name}</span>
        {round.locked === "preliminary" && (
          <span className="rounded-full border border-accent/35 bg-accent/8 px-2.25 py-0.75 text-[11px] text-accent">初賽 · 固定頭</span>
        )}
        {round.locked === "final" && (
          <span className="rounded-full border border-accent/35 bg-accent/8 px-2.25 py-0.75 text-[11px] text-accent">決賽 · 固定尾</span>
        )}
        {!isLocked && (
          <button title="移除此輪次" onClick={() => onRemove(round.id)} className="text-ink-dim hover:text-ink">
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      <div className="mb-3.5">
        <div className="mb-2 text-[11px] tracking-wide text-ink-faint uppercase">淘汰方式</div>
        <div className="flex flex-wrap gap-1.75">
          {FORMAT_BLOCKS.elimination.map((b) => (
            <button
              key={b.key}
              onClick={() => onToggleBlock(round.id, "elimination", b.key)}
              className={`rounded-full border px-3.25 py-1.5 text-[12px] ${
                round.elimination === b.key
                  ? "border-accent/40 bg-accent/16 text-ink"
                  : "border-panel-border bg-white/[0.03] text-ink-dim hover:bg-white/[0.06] hover:text-ink"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3.5">
        <div className="mb-2 text-[11px] tracking-wide text-ink-faint uppercase">分組方式</div>
        <div className="flex flex-wrap gap-1.75">
          {FORMAT_BLOCKS.grouping.map((b) => (
            <button
              key={b.key}
              onClick={() => onToggleBlock(round.id, "grouping", b.key)}
              className={`rounded-full border px-3.25 py-1.5 text-[12px] ${
                round.grouping === b.key
                  ? "border-accent/40 bg-accent/16 text-ink"
                  : "border-panel-border bg-white/[0.03] text-ink-dim hover:bg-white/[0.06] hover:text-ink"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3.5">
        <div className="mb-2 text-[11px] tracking-wide text-ink-faint uppercase">特殊機制（可複選）</div>
        <div className="flex flex-wrap gap-1.75">
          {FORMAT_BLOCKS.special.map((b) => (
            <button
              key={b.key}
              onClick={() => onToggleBlock(round.id, "special", b.key)}
              className={`rounded-full border px-3.25 py-1.5 text-[12px] ${
                round.special.includes(b.key)
                  ? "border-accent/40 bg-accent/16 text-ink"
                  : "border-panel-border bg-white/[0.03] text-ink-dim hover:bg-white/[0.06] hover:text-ink"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2.5 border-t border-panel-border pt-2.5">
        <Switch on={round.scoringOverride} onClick={() => onToggleOverride(round.id)} />
        <span className="text-[12.5px]">此輪使用 ScoringRuleOverride（不勾選則沿用 Competition 預設評分規則）</span>
      </div>
      {round.scoringOverride && (
        <ScoreEditor context={`「${round.name}」的覆寫規則`} extraItem={round.special.includes("theme")} />
      )}
      {isLocked && (
        <div className="mt-2.5 text-[11.5px] leading-relaxed text-ink-faint">
          {round.locked === "preliminary"
            ? "初賽與決賽是固定頭尾，不可移除，但賽制積木可自訂。"
            : "決賽為固定尾，不可移除，但賽制積木可自訂。"}
        </div>
      )}
    </div>
  );
}

export default function AdminFormatPage() {
  const [rounds, setRounds] = useState<Round[]>(MOCK_COMPETITION.rounds);
  const [anonymityMode, setAnonymityMode] = useState(MOCK_COMPETITION.anonymityMode);

  const toggleBlock = (roundId: string, group: BlockGroup, key: string) => {
    setRounds((rs) =>
      rs.map((r) => {
        if (r.id !== roundId) return r;
        if (group === "special") {
          const has = r.special.includes(key);
          return { ...r, special: has ? r.special.filter((k) => k !== key) : [...r.special, key] };
        }
        return { ...r, [group]: key };
      }),
    );
  };
  const toggleOverride = (roundId: string) =>
    setRounds((rs) => rs.map((r) => (r.id === roundId ? { ...r, scoringOverride: !r.scoringOverride } : r)));
  const addRound = () =>
    setRounds((rs) => {
      const middleCount = rs.length - 1; // 不含決賽
      const newRound: Round = {
        id: `r-new-${rs.length}`,
        name: `第 ${middleCount + 1} 輪 · 新輪次`,
        locked: null,
        elimination: "single-elim",
        grouping: "individual",
        special: [],
        scoringOverride: false,
      };
      return [...rs.slice(0, -1), newRound, rs[rs.length - 1]]; // 插在決賽之前
    });
  const removeRound = (roundId: string) => setRounds((rs) => rs.filter((r) => r.id !== roundId));

  return (
    <AdminShell active="format">
      <div className="mb-7">
        <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 賽制建立</div>
        <h1 className="font-display text-[30px]">建立比賽</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          先設定 Competition 外框，再逐輪設定 FormatBlock 組合；評分規則預設整場沿用同一套，只有需要的輪次才個別覆寫（見 ADR-0001）。
        </p>
      </div>

      <div className="mb-7 grid grid-cols-[1fr_280px] gap-5">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">Competition 名稱</label>
          <input
            defaultValue={MOCK_COMPETITION.name}
            className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">匿名揭露模式（AnonymityMode）</label>
          <select
            value={anonymityMode}
            onChange={(e) => setAnonymityMode(e.target.value)}
            className="w-full appearance-none rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
          >
            <option value="until-final">全程匿名，決賽才公開</option>
            <option value="single-round">單輪匿名，賽後公開</option>
            <option value="public">全程公開</option>
          </select>
        </div>
      </div>

      <div className="mb-5">
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">Competition 預設 ScoringRule</label>
        <div className="mb-2.5 text-[11.5px] leading-relaxed text-ink-faint">套用到所有未個別覆寫的輪次。</div>
        <ScoreEditor context="Competition 預設規則" />
      </div>

      <div className="mt-2 mb-3.5">
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">
          輪次（Round）— 第一輪固定初賽、最後一輪固定決賽，中間可新增／自訂
        </label>
      </div>
      {rounds.map((r) => (
        <RoundFormatCard key={r.id} round={r} onToggleBlock={toggleBlock} onToggleOverride={toggleOverride} onRemove={removeRound} />
      ))}
      <button
        onClick={addRound}
        className="mt-1 flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-4.5 py-2.5 text-[13.5px] font-semibold text-ink"
      >
        <Icon name="plus" size={13} /> 新增中間輪次
      </button>
    </AdminShell>
  );
}
