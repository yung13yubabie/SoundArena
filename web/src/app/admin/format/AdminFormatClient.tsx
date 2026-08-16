"use client";

import { useState, useTransition } from "react";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { Switch } from "@/components/Switch";
import { Icon } from "@/lib/icons";
import {
  updateCompetitionMeta,
  toggleFormatBlock,
  addRound,
  removeRound,
  toggleScoringOverride,
  saveScoreItems,
} from "./actions";

export interface ScoreItemData {
  id: string;
  label: string;
  kind: "weighted" | "bonus";
  weightPercent: number | null;
}

export interface RoundData {
  id: string;
  name: string;
  locked: "preliminary" | "final" | null;
  elimination: string | null;
  grouping: string | null;
  special: string[];
  scoringRule: { id: string; items: ScoreItemData[] } | null;
}

export interface CompetitionData {
  id: string;
  name: string;
  anonymityMode: string;
}

export interface FormatBlockCatalog {
  elimination: Array<{ key: string; label: string }>;
  grouping: Array<{ key: string; label: string }>;
  special: Array<{ key: string; label: string }>;
}

type BlockGroup = "elimination" | "grouping" | "special";

function ScoreEditor({
  scoringRuleId,
  initialItems,
  context,
}: {
  scoringRuleId: string;
  initialItems: ScoreItemData[];
  context: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const setWeight = (id: string, w: number) => {
    setItems((its) => its.map((it) => (it.id === id ? { ...it, weightPercent: w } : it)));
    setSaved(false);
  };
  const setKind = (id: string, kind: ScoreItemData["kind"]) => {
    setItems((its) =>
      its.map((it) => (it.id === id ? { ...it, kind, weightPercent: kind === "weighted" ? (it.weightPercent ?? 0) : null } : it)),
    );
    setSaved(false);
  };
  const removeItem = (id: string) => {
    setItems((its) => its.filter((it) => it.id !== id));
    setSaved(false);
  };

  const weightedItems = items.filter((i) => i.kind === "weighted");
  const weightedSum = weightedItems.reduce((s, i) => s + (i.weightPercent ?? 0), 0);
  const sumOk = weightedItems.length === 0 || weightedSum === 100;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await saveScoreItems(
      scoringRuleId,
      items.map((it) => ({ id: it.id, label: it.label, kind: it.kind, weight_percent: it.weightPercent })),
    );
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setSaved(true);
    }
  }

  return (
    <div className="glass mt-2 px-4 py-3.5">
      <div className="mb-2 text-[11.5px] text-ink-faint">{context}</div>
      {items.length === 0 && (
        <EmptyState icon="inbox" title="沒有啟用任何計分項目" sub="至少要保留一個項目，比賽才有分數可以排名" />
      )}
      {items.map((it) => (
        <div key={it.id} className="grid grid-cols-[1fr_110px_90px_90px_32px] items-center gap-2.5 py-2">
          <span className="text-[12.5px]">{it.label}</span>
          <select
            value={it.kind}
            onChange={(e) => setKind(it.id, e.target.value as ScoreItemData["kind"])}
            className="w-full rounded-lg border border-panel-border bg-black/25 px-2.25 py-1.75 text-[12.5px] text-ink [color-scheme:dark]"
          >
            <option value="weighted">加權計分（計入100%）</option>
            <option value="bonus">額外加分（不封頂）</option>
          </select>
          <input
            type="number"
            min="0"
            max="100"
            value={it.weightPercent ?? ""}
            onChange={(e) => setWeight(it.id, Number(e.target.value))}
            disabled={it.kind !== "weighted"}
            className="w-full rounded-lg border border-panel-border bg-black/25 px-2.25 py-1.75 text-[12.5px] text-ink disabled:opacity-40"
          />
          <span className="text-[11px] text-ink-faint">%</span>
          <button title="移除此計分項目" onClick={() => removeItem(it.id)} className="text-ink-dim hover:text-ink">
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
      {error && <p className="mt-2.5 text-[12px] text-bad">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving || !sumOk}
        className="mt-3 rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3.5 py-1.5 text-[12px] font-semibold text-[#1a0e08] disabled:opacity-45"
      >
        {saving ? "儲存中…" : saved ? "已儲存" : "儲存計分設定"}
      </button>
    </div>
  );
}

function RoundFormatCard({
  round,
  competitionId,
  catalog,
}: {
  round: RoundData;
  competitionId: string;
  catalog: FormatBlockCatalog;
}) {
  const [isPending, startTransition] = useTransition();
  const isLocked = !!round.locked;

  const toggleBlock = (group: BlockGroup, key: string) => {
    startTransition(() => {
      toggleFormatBlock(round.id, group, key);
    });
  };
  const toggleOverride = () => {
    startTransition(() => {
      toggleScoringOverride(round.id, competitionId, !round.scoringRule);
    });
  };

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
          <button
            title="移除此輪次"
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                removeRound(round.id);
              })
            }
            className="text-ink-dim hover:text-ink disabled:opacity-40"
          >
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      <div className="mb-3.5">
        <div className="mb-2 text-[11px] tracking-wide text-ink-faint uppercase">淘汰方式</div>
        <div className="flex flex-wrap gap-1.75">
          {catalog.elimination.map((b) => (
            <button
              key={b.key}
              disabled={isPending}
              onClick={() => toggleBlock("elimination", b.key)}
              className={`rounded-full border px-3.25 py-1.5 text-[12px] disabled:opacity-50 ${
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
          {catalog.grouping.map((b) => (
            <button
              key={b.key}
              disabled={isPending}
              onClick={() => toggleBlock("grouping", b.key)}
              className={`rounded-full border px-3.25 py-1.5 text-[12px] disabled:opacity-50 ${
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
          {catalog.special.map((b) => (
            <button
              key={b.key}
              disabled={isPending}
              onClick={() => toggleBlock("special", b.key)}
              className={`rounded-full border px-3.25 py-1.5 text-[12px] disabled:opacity-50 ${
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
        <Switch on={!!round.scoringRule} onClick={toggleOverride} />
        <span className="text-[12.5px]">此輪使用 ScoringRuleOverride（不勾選則沿用 Competition 預設評分規則）</span>
      </div>
      {round.scoringRule && (
        <ScoreEditor
          scoringRuleId={round.scoringRule.id}
          initialItems={round.scoringRule.items}
          context={`「${round.name}」的覆寫規則`}
        />
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

function CompetitionMetaForm({ competition }: { competition: CompetitionData }) {
  const [name, setName] = useState(competition.name);
  const [anonymityMode, setAnonymityMode] = useState(competition.anonymityMode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateCompetitionMeta(competition.id, name, anonymityMode);
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="mb-7 grid grid-cols-[1fr_280px] gap-5">
      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">Competition 名稱</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className="w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">匿名揭露模式（AnonymityMode）</label>
        <select
          value={anonymityMode}
          onChange={(e) => {
            setAnonymityMode(e.target.value);
            setSaved(false);
          }}
          className="w-full appearance-none rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50 [color-scheme:dark]"
        >
          <option value="full_anonymous_until_final">全程匿名，決賽才公開</option>
          <option value="per_round_anonymous">單輪匿名，賽後公開</option>
          <option value="fully_public">全程公開</option>
        </select>
      </div>
      <div className="col-span-full">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-45"
        >
          {saving ? "儲存中…" : saved ? "已儲存" : "儲存基本資料"}
        </button>
      </div>
    </div>
  );
}

interface AdminFormatClientProps {
  competition: CompetitionData;
  defaultScoringRuleId: string | null;
  defaultScoreItems: ScoreItemData[];
  rounds: RoundData[];
  formatBlockCatalog: FormatBlockCatalog;
  competitionList: Array<{ id: string; name: string }>;
}

export function AdminFormatClient({
  competition,
  defaultScoringRuleId,
  defaultScoreItems,
  rounds,
  formatBlockCatalog,
  competitionList,
}: AdminFormatClientProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <AdminShell active="format" competitions={competitionList} activeCompetitionId={competition.id}>
      <div className="mb-7">
        <div className="mb-2 text-xs uppercase tracking-widest text-accent">Screen · 賽制建立</div>
        <h1 className="font-display text-[30px]">建立比賽</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          先填比賽的基本資料，再逐輪決定賽制怎麼組合。評分規則預設整場共用，只有需要的輪次才個別調整。
        </p>
      </div>

      <CompetitionMetaForm competition={competition} />

      {defaultScoringRuleId && (
        <div className="mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">Competition 預設 ScoringRule</label>
          <div className="mb-2.5 text-[11.5px] leading-relaxed text-ink-faint">套用到所有未個別覆寫的輪次。</div>
          <ScoreEditor scoringRuleId={defaultScoringRuleId} initialItems={defaultScoreItems} context="Competition 預設規則" />
        </div>
      )}

      <div className="mt-2 mb-3.5">
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">
          輪次（Round）— 第一輪固定初賽、最後一輪固定決賽，中間可新增／自訂
        </label>
      </div>
      {rounds.map((r) => (
        <RoundFormatCard key={r.id} round={r} competitionId={competition.id} catalog={formatBlockCatalog} />
      ))}
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            addRound(competition.id);
          })
        }
        className="mt-1 flex items-center gap-1.5 rounded-[10px] border border-panel-border bg-white/[0.04] px-4.5 py-2.5 text-[13.5px] font-semibold text-ink disabled:opacity-45"
      >
        <Icon name="plus" size={13} /> 新增中間輪次
      </button>
    </AdminShell>
  );
}
