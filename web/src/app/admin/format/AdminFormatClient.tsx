"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { Switch } from "@/components/Switch";
import { Icon } from "@/lib/icons";
import { toDatetimeLocalInput, fromDatetimeLocalInput } from "@/lib/datetimeLocal";
import {
  updateCompetitionMeta,
  toggleFormatBlock,
  saveFormatBlockConfig,
  addRound,
  removeRound,
  toggleScoringOverride,
  saveScoreItems,
  addScoreItem,
  setRoundAnonymity,
  setAllRoundsAnonymity,
  setRoundScheduleOverride,
  deleteCompetition,
  cleanupNonFinalistAudio,
  swapTeamMember,
} from "./actions";

export interface ScoreItemData {
  id: string;
  label: string;
  kind: "weighted" | "bonus";
  weightPercent: number | null;
  templateKey: string | null;
}

export interface ScoreItemTemplate {
  key: string;
  label: string;
  defaultKind: "weighted" | "bonus";
}

export interface ThemeConfig {
  themeType: "keyword" | "genre";
  themeValue: string;
}

export interface TeamMemberData {
  registrationId: string;
  displayName: string;
}

export interface TeamData {
  id: string;
  name: string;
  members: TeamMemberData[];
}

export interface RoundData {
  id: string;
  name: string;
  locked: "preliminary" | "final" | null;
  elimination: string | null;
  grouping: string | null;
  special: string[];
  isAnonymous: boolean;
  themeConfig: ThemeConfig | null;
  teamSize: number | null;
  teams: TeamData[];
  scoringRule: { id: string; items: ScoreItemData[] } | null;
  submissionOpensAt: string | null;
  submissionClosesAt: string | null;
  votingOpensAt: string | null;
  votingClosesAt: string | null;
}

export interface CompetitionData {
  id: string;
  name: string;
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
  catalog,
}: {
  scoringRuleId: string;
  initialItems: ScoreItemData[];
  context: string;
  catalog: ScoreItemTemplate[];
}) {
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pickerKey, setPickerKey] = useState("");

  const usedKeys = new Set(items.map((it) => it.templateKey).filter((k): k is string => !!k));
  const availableTemplates = catalog.filter((t) => !usedKeys.has(t.key));

  async function addItem() {
    const template = availableTemplates.find((t) => t.key === pickerKey);
    if (!template) return;
    setAdding(true);
    setError(null);
    const result = await addScoreItem(scoringRuleId, template.key);
    setAdding(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setItems((its) => [
      ...its,
      {
        id: result.id,
        label: template.label,
        kind: template.defaultKind,
        weightPercent: template.defaultKind === "weighted" ? 0 : null,
        templateKey: template.key,
      },
    ]);
    setPickerKey("");
    setSaved(false);
  }

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
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
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
          </div>
        </div>
      )}
      {availableTemplates.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <select
            value={pickerKey}
            onChange={(e) => setPickerKey(e.target.value)}
            className="flex-1 rounded-lg border border-panel-border bg-black/25 px-2.25 py-1.75 text-[12.5px] text-ink [color-scheme:dark]"
          >
            <option value="">從範本加入計分項目…</option>
            {availableTemplates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={addItem}
            disabled={!pickerKey || adding}
            className="flex items-center gap-1 rounded-lg border border-panel-border bg-white/[0.04] px-2.5 py-1.75 text-[12px] text-ink disabled:opacity-40"
          >
            <Icon name="plus" size={13} /> 加入
          </button>
        </div>
      )}
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

function ThemedRoundConfigPanel({ roundId, initial }: { roundId: string; initial: ThemeConfig | null }) {
  const [themeType, setThemeType] = useState<ThemeConfig["themeType"]>(initial?.themeType ?? "keyword");
  const [themeValue, setThemeValue] = useState(initial?.themeValue ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await saveFormatBlockConfig(roundId, "themed_round", { theme_type: themeType, theme_value: themeValue.trim() });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="glass mt-2 mb-3.5 px-4 py-3.5">
      <div className="mb-2.5 text-[11.5px] text-ink-faint">設定這一輪的限定主題，比賽規則頁會公開顯示給所有人看</div>
      <div className="mb-2.5 flex gap-1.75">
        <button
          onClick={() => {
            setThemeType("keyword");
            setSaved(false);
          }}
          className={`rounded-full border px-3 py-1.25 text-[12px] ${
            themeType === "keyword"
              ? "border-accent/40 bg-accent/16 text-ink"
              : "border-panel-border bg-white/[0.03] text-ink-dim"
          }`}
        >
          關鍵字/詞句限定
        </button>
        <button
          onClick={() => {
            setThemeType("genre");
            setSaved(false);
          }}
          className={`rounded-full border px-3 py-1.25 text-[12px] ${
            themeType === "genre"
              ? "border-accent/40 bg-accent/16 text-ink"
              : "border-panel-border bg-white/[0.03] text-ink-dim"
          }`}
        >
          曲風限定
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={themeValue}
          onChange={(e) => {
            setThemeValue(e.target.value);
            setSaved(false);
          }}
          placeholder={themeType === "keyword" ? "例如：夏天、離別" : "例如：City Pop、Lo-fi"}
          className="flex-1 rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2 text-[13px] text-ink outline-none focus:border-accent/50"
        />
        <button
          onClick={handleSave}
          disabled={saving || !themeValue.trim()}
          className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3.5 py-2 text-[12.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
        >
          {saving ? "儲存中…" : saved ? "已儲存" : "儲存"}
        </button>
      </div>
      {themeType === "genre" && (
        <div className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          投稿是否符合這個曲風，目前由你在審核時人工判斷，還沒有系統自動比對。
        </div>
      )}
    </div>
  );
}

function TeamConfigPanel({ roundId, initialTeamSize }: { roundId: string; initialTeamSize: number | null }) {
  const [teamSize, setTeamSize] = useState(initialTeamSize ?? 3);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await saveFormatBlockConfig(roundId, "team", { team_size: teamSize });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="glass mt-2 mb-3.5 px-4 py-3.5">
      <div className="mb-2.5 text-[11.5px] leading-relaxed text-ink-faint">
        每隊人數——報名截止（或前一輪確認結果）後，系統會自動把還在比賽中的參賽者隨機分成這個人數的隊伍，並發訊息通知每個人自己的隊伍。人數除不盡時，最後一隊人數較少。
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="2"
          value={teamSize}
          onChange={(e) => {
            setTeamSize(Number(e.target.value));
            setSaved(false);
          }}
          className="w-24 rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2 text-[13px] text-ink outline-none focus:border-accent/50"
        />
        <span className="text-[12.5px] text-ink-dim">人 / 隊</span>
        <button
          onClick={handleSave}
          disabled={saving || teamSize < 2}
          className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-3.5 py-2 text-[12.5px] font-semibold text-[#1a0e08] disabled:opacity-45"
        >
          {saving ? "儲存中…" : saved ? "已儲存" : "儲存"}
        </button>
      </div>
    </div>
  );
}

function TeamRosterPanel({ teams }: { teams: TeamData[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (teams.length === 0) {
    return (
      <div className="glass mt-2 mb-3.5 px-4 py-3.5 text-[12px] leading-relaxed text-ink-faint">
        還沒有分組——會在報名截止（或前一輪確認結果）後自動進行，不需要手動觸發。
      </div>
    );
  }

  const move = (registrationId: string, newTeamId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await swapTeamMember(registrationId, newTeamId);
      if ("error" in result) setError(result.error);
    });
  };

  return (
    <div className="glass mt-2 mb-3.5 px-4 py-3.5">
      <div className="mb-2.5 text-[11.5px] text-ink-faint">目前分組——可以用下拉選單手動換組，換組後會通知異動雙方</div>
      {error && <p className="mb-2.5 text-[12px] text-bad">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {teams.map((team) => (
          <div key={team.id} className="rounded-[10px] border border-panel-border bg-white/[0.02] p-3">
            <div className="mb-1.5 text-[12.5px] font-semibold">{team.name}</div>
            {team.members.map((m) => (
              <div key={m.registrationId} className="flex items-center justify-between gap-2 py-1">
                <span className="text-[12.5px]">{m.displayName}</span>
                <select
                  value={team.id}
                  disabled={isPending}
                  onChange={(e) => move(m.registrationId, e.target.value)}
                  className="rounded-lg border border-panel-border bg-black/25 px-2 py-1 text-[11.5px] text-ink [color-scheme:dark] disabled:opacity-45"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoundFormatCard({
  round,
  competitionId,
  catalog,
  scoreTemplates,
}: {
  round: RoundData;
  competitionId: string;
  catalog: FormatBlockCatalog;
  scoreTemplates: ScoreItemTemplate[];
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
  const toggleAnonymous = () => {
    startTransition(() => {
      setRoundAnonymity(round.id, !round.isAnonymous);
    });
  };

  return (
    <div className="glass mb-4 p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex-1 text-[15px] font-semibold">{round.name}</span>
        <div className="flex items-center gap-1.75">
          <Switch on={round.isAnonymous} label={`「${round.name}」是否匿名`} onClick={toggleAnonymous} />
          <span className="text-[11.5px] text-ink-dim">{round.isAnonymous ? "本輪匿名" : "本輪公開"}</span>
        </div>
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

      {round.special.includes("themed_round") && <ThemedRoundConfigPanel roundId={round.id} initial={round.themeConfig} />}
      {round.grouping === "team" && (
        <>
          <TeamConfigPanel roundId={round.id} initialTeamSize={round.teamSize} />
          <TeamRosterPanel teams={round.teams} />
        </>
      )}

      <div className="mt-3.5 flex items-center gap-2.5 border-t border-panel-border pt-2.5">
        <Switch on={!!round.scoringRule} label="此輪是否使用獨立評分規則" onClick={toggleOverride} />
        <span className="text-[12.5px]">此輪使用獨立評分規則（不勾選則沿用比賽預設評分規則）</span>
      </div>
      {round.scoringRule && (
        <ScoreEditor
          scoringRuleId={round.scoringRule.id}
          initialItems={round.scoringRule.items}
          context={`「${round.name}」的覆寫規則`}
          catalog={scoreTemplates}
        />
      )}
      {isLocked && (
        <div className="mt-2.5 text-[11.5px] leading-relaxed text-ink-faint">
          {round.locked === "preliminary"
            ? "初賽與決賽是固定頭尾，不可移除，但賽制積木可自訂。"
            : "決賽為固定尾，不可移除，但賽制積木可自訂。"}
        </div>
      )}

      <RoundScheduleOverridePanel round={round} />
    </div>
  );
}

// DB-09(b) grilling 確認:多輪比賽的投稿/投票時間預設全部輪次共用「時程設定」頁
// 套用的同一組值,這裡讓單一輪次可以選填專屬時程(例如兩輪之間留空檔休息)。不填
// 就維持沿用整體時程;填了之後,如果又跑一次「時程設定」頁的整體套用,會把這裡的
// 專屬設定蓋掉——沒有另外做「鎖定不被覆蓋」的機制,這是刻意的簡化。
function RoundScheduleOverridePanel({ round }: { round: RoundData }) {
  const [expanded, setExpanded] = useState(false);
  const [submissionStart, setSubmissionStart] = useState(() => toDatetimeLocalInput(round.submissionOpensAt));
  const [submissionEnd, setSubmissionEnd] = useState(() => toDatetimeLocalInput(round.submissionClosesAt));
  const [votingStart, setVotingStart] = useState(() => toDatetimeLocalInput(round.votingOpensAt));
  const [votingEnd, setVotingEnd] = useState(() => toDatetimeLocalInput(round.votingClosesAt));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await setRoundScheduleOverride(round.id, {
      submissionOpensAt: fromDatetimeLocalInput(submissionStart),
      submissionClosesAt: fromDatetimeLocalInput(submissionEnd),
      votingOpensAt: fromDatetimeLocalInput(votingStart),
      votingClosesAt: fromDatetimeLocalInput(votingEnd),
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setSaved(true);
    }
  }

  return (
    <div className="mt-3.5 border-t border-panel-border pt-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-dim hover:text-ink"
      >
        <Icon name="chevron" size={11} className={expanded ? "rotate-90" : ""} />
        本輪專屬時程（選填，不填就沿用「時程設定」頁的整體設定）
      </button>
      {expanded && (
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10.5px] tracking-wide text-ink-faint uppercase">投稿開始</label>
            <input
              type="datetime-local"
              value={submissionStart}
              onChange={(e) => {
                setSubmissionStart(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] tracking-wide text-ink-faint uppercase">投稿結束</label>
            <input
              type="datetime-local"
              value={submissionEnd}
              onChange={(e) => {
                setSubmissionEnd(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] tracking-wide text-ink-faint uppercase">投票開始</label>
            <input
              type="datetime-local"
              value={votingStart}
              onChange={(e) => {
                setVotingStart(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] tracking-wide text-ink-faint uppercase">投票結束</label>
            <input
              type="datetime-local"
              value={votingEnd}
              onChange={(e) => {
                setVotingEnd(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-lg border border-panel-border bg-black/25 px-2.5 py-2 text-[12.5px] text-ink [color-scheme:dark]"
            />
          </div>
          {error && <p className="col-span-full text-[12px] text-bad">儲存失敗：{error}</p>}
          <div className="col-span-full">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-[9px] border border-panel-border bg-white/[0.04] px-3.5 py-1.75 text-[12px] font-semibold text-ink disabled:opacity-45"
            >
              {saving ? "儲存中…" : saved ? "已儲存" : "儲存本輪時程"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompetitionMetaForm({ competition }: { competition: CompetitionData }) {
  const router = useRouter();
  const [name, setName] = useState(competition.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingCleanup, setConfirmingCleanup] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<number | null>(null);

  async function handleSave() {
    setSaving(true);
    await updateCompetitionMeta(competition.id, name);
    setSaving(false);
    setSaved(true);
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteCompetition(competition.id);
    setDeleting(false);
    if ("error" in result) {
      setDeleteError(result.error);
      setConfirmingDelete(false);
      return;
    }
    router.push("/admin/format");
  }

  async function handleCleanup() {
    setCleaningUp(true);
    setCleanupError(null);
    const result = await cleanupNonFinalistAudio(competition.id);
    setCleaningUp(false);
    setConfirmingCleanup(false);
    if ("error" in result) {
      setCleanupError(result.error);
      return;
    }
    setCleanupResult(result.cleared);
  }

  return (
    <div className="mb-7">
      <div className="mb-5">
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">比賽名稱</label>
        <div className="flex gap-2.5">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            className="w-full max-w-[420px] rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-45"
          >
            {saving ? "儲存中…" : saved ? "已儲存" : "儲存"}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">
          匿名揭露設定 — 逐輪設定,以下是套用到全部輪次的快捷
        </label>
        <div className="flex gap-1.75">
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                setAllRoundsAnonymity(competition.id, true);
              })
            }
            className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-45"
          >
            全部設為匿名
          </button>
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                setAllRoundsAnonymity(competition.id, false);
              })
            }
            className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-45"
          >
            全部設為公開
          </button>
        </div>
        <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-faint">
          匿名的輪次投票截止後才公開作者身份;公開的輪次從一開始就看得到是誰投稿。每輪下方可個別覆寫。
        </div>
      </div>

      <div className="mt-7 border-t border-panel-border pt-5">
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">整理音檔儲存空間</label>
        <p className="mb-2.5 text-[11.5px] leading-relaxed text-ink-faint">
          決賽投票截止（整場比賽完全結束）後，可以一次清掉「非前三名」參賽者上傳的音檔，只保留 Suno 連結，前三名的音檔會保留。決賽投票還沒截止的話無法執行。
        </p>
        {cleanupError && (
          <p className="mb-2.5 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{cleanupError}</p>
        )}
        {cleanupResult !== null && (
          <p className="mb-2.5 rounded-[10px] border border-ok/30 bg-ok/10 p-2.5 text-[12px] text-ok">
            已清除 {cleanupResult} 筆非前三名的音檔
          </p>
        )}
        {confirmingCleanup ? (
          <div className="flex items-center gap-2.5">
            <span className="text-[12px] text-warn">確定要清除非前三名的音檔嗎？此動作無法復原。</span>
            <button
              onClick={handleCleanup}
              disabled={cleaningUp}
              className="rounded-[10px] border border-warn/35 bg-warn/8 px-3.5 py-1.5 text-[12px] font-semibold text-warn transition-colors hover:bg-warn/14 disabled:opacity-45"
            >
              {cleaningUp ? "清除中…" : "確定清除"}
            </button>
            <button
              onClick={() => setConfirmingCleanup(false)}
              disabled={cleaningUp}
              className="rounded-[10px] border border-panel-border px-3.5 py-1.5 text-[12px] text-ink-dim disabled:opacity-45"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingCleanup(true)}
            className="rounded-[10px] border border-panel-border bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-warn/40"
          >
            清除非前三名音檔
          </button>
        )}
      </div>

      <div className="mt-7 border-t border-panel-border pt-5">
        <label className="mb-1.5 block text-[12.5px] font-semibold text-bad">刪除這場比賽</label>
        <p className="mb-2.5 text-[11.5px] leading-relaxed text-ink-faint">
          還沒有任何人報名時可以直接刪除;一旦有真實報名紀錄，就需要請平台管理員協助刪除。這個動作無法復原。
        </p>
        {deleteError && (
          <p className="mb-2.5 rounded-[10px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{deleteError}</p>
        )}
        {confirmingDelete ? (
          <div className="flex items-center gap-2.5">
            <span className="text-[12px] text-bad">確定要刪除「{competition.name}」嗎？</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-[10px] border border-bad/35 bg-bad/8 px-3.5 py-1.5 text-[12px] font-semibold text-bad transition-colors hover:bg-bad/14 disabled:opacity-45"
            >
              {deleting ? "刪除中…" : "確定刪除"}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="rounded-[10px] border border-panel-border px-3.5 py-1.5 text-[12px] text-ink-dim disabled:opacity-45"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="rounded-[10px] border border-bad/35 bg-bad/8 px-3.5 py-1.5 text-[12px] font-semibold text-bad transition-colors hover:bg-bad/14"
          >
            刪除比賽
          </button>
        )}
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
  scoreItemTemplates: ScoreItemTemplate[];
  competitionList: Array<{ id: string; name: string }>;
  isPlatformAdmin?: boolean;
  hasRegistrations: boolean;
}

export function AdminFormatClient({
  competition,
  defaultScoringRuleId,
  defaultScoreItems,
  rounds,
  formatBlockCatalog,
  scoreItemTemplates,
  competitionList,
  isPlatformAdmin = false,
  hasRegistrations,
}: AdminFormatClientProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <AdminShell
      active="format"
      competitions={competitionList}
      activeCompetitionId={competition.id}
      isPlatformAdmin={isPlatformAdmin}
    >
      <div className="mb-7">
        <h1 className="font-display text-[30px]">建立比賽</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          先填比賽的基本資料，再逐輪決定賽制怎麼組合。評分規則預設整場共用，只有需要的輪次才個別調整。
        </p>
      </div>

      <CompetitionMetaForm competition={competition} />

      {defaultScoringRuleId && (
        <div className="mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">比賽預設評分規則</label>
          <div className="mb-2.5 text-[11.5px] leading-relaxed text-ink-faint">套用到所有未個別覆寫的輪次。</div>
          <ScoreEditor
            scoringRuleId={defaultScoringRuleId}
            initialItems={defaultScoreItems}
            context="比賽預設規則"
            catalog={scoreItemTemplates}
          />
        </div>
      )}

      <div className="mt-2 mb-3.5">
        <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">
          輪次（Round）— 第一輪固定初賽、最後一輪固定決賽，中間可新增／自訂
        </label>
        {!hasRegistrations && (
          <div className="mt-2 flex items-start gap-2 rounded-[10px] border border-warn/30 bg-warn/8 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-warn">
            <Icon name="alert" size={13} className="mt-0.5 flex-none" />
            <span>
              目前共 {rounds.length} 輪：{rounds.map((r) => r.name).join("、")}。開放報名後，已有真實投稿的輪次就無法自助移除了（見上方比賽的報名時間設定），建議先在這裡確認好輪次數量跟順序。
            </span>
          </div>
        )}
      </div>
      {rounds.map((r) => (
        <RoundFormatCard
          key={r.id}
          round={r}
          competitionId={competition.id}
          catalog={formatBlockCatalog}
          scoreTemplates={scoreItemTemplates}
        />
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
