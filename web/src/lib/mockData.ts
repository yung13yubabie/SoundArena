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


