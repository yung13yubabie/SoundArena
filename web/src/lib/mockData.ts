// Domain mock data (依 CONTEXT.md 的實體定義) — shared across the admin screens
// (審核後台／賽制建立／時程設定／個人狀態) that were ported from design/prototype.html.
// Real data comes later once Competition/Round/Submission are backed by Supabase.

export const SUBMISSION_STATE_META = {
  draft: { label: "草稿", cls: "draft" },
  identity_checking: { label: "身份比對中", cls: "checking" },
  identity_mismatched: { label: "身份比對不通過，待更正", cls: "mismatched" },
  pending_review: { label: "待人工審核", cls: "pending" },
  approved: { label: "已通過", cls: "approved" },
  rejected: { label: "已退回", cls: "rejected" },
} as const;

export type SubmissionState = keyof typeof SUBMISSION_STATE_META;

// Tailwind classes per state-pill "cls" bucket from design/prototype.html.
export const STATE_PILL_CLASS: Record<string, string> = {
  draft: "border-panel-border text-ink-faint",
  checking: "border-[#8fb3d9]/35 bg-[#8fb3d9]/8 text-[#8fb3d9]",
  mismatched: "border-bad/35 bg-bad/8 text-bad",
  pending: "border-warn/35 bg-warn/8 text-warn",
  approved: "border-ok/35 bg-ok/8 text-ok",
  rejected: "border-panel-border text-ink-faint line-through",
};

export const MOCK_COMPETITION = {
  name: "深夜擂台 EP.03",
  anonymityMode: "single-round",
  rounds: [
    {
      id: "r1",
      name: "第 1 輪 · 海選",
      locked: "preliminary" as const,
      elimination: "round-robin",
      grouping: "individual",
      special: [] as string[],
      scoringOverride: false,
    },
    {
      id: "r2",
      name: "第 2 輪 · 複賽",
      locked: null,
      elimination: "single-elim",
      grouping: "team-3v3",
      special: ["theme"] as string[],
      scoringOverride: true,
    },
    {
      id: "r3",
      name: "決賽",
      locked: "final" as const,
      elimination: "single-elim",
      grouping: "individual",
      special: [] as string[],
      scoringOverride: false,
    },
  ],
};

export const MOCK_MY_SUBMISSIONS: Array<{ round: string; state: SubmissionState; locked?: boolean }> = [
  { round: "第 1 輪 · 海選", state: "approved" },
  { round: "第 2 輪 · 複賽", state: "pending_review" },
  { round: "決賽", state: "draft", locked: true },
];

export const MOCK_REVIEW_QUEUE = [
  {
    id: 1,
    nickname: "夜遊者",
    track: "未命名作品 #1",
    handle: "my13u",
    identityMatch: "match" as const,
    unlistedOk: true as boolean | null,
    state: "pending_review" as SubmissionState,
  },
  {
    id: 2,
    nickname: "霓虹貓",
    track: "未命名作品 #4",
    handle: "grudgegrocerystore",
    identityMatch: "mismatch" as const,
    unlistedOk: null as boolean | null,
    state: "identity_mismatched" as SubmissionState,
  },
  {
    id: 3,
    nickname: "午夜鯨",
    track: "未命名作品 #7",
    handle: "unknown",
    identityMatch: "match" as const,
    unlistedOk: false as boolean | null,
    state: "pending_review" as SubmissionState,
  },
];

export const MOCK_ALL_COMPETITIONS_PLATFORM = [
  { id: "c1", name: "深夜擂台 EP.03", organizer: "夜遊者", status: "active" },
  { id: "c2", name: "Lo-fi 對決之夜", organizer: "霓虹貓", status: "active" },
  { id: "c3", name: "新手擂台盃", organizer: "午夜鯨", status: "upcoming" },
];

