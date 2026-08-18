"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/lib/icons";
import { Switch } from "@/components/Switch";
import { EmptyState } from "@/components/EmptyState";
import {
  inviteCollaboratorByEmail,
  updateCollaboratorPermissions,
  removeCollaborator,
  type CollaboratorPermissions,
} from "./actions";

export interface CollaboratorRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  permissions: CollaboratorPermissions;
  isSelf: boolean;
}

interface CollaboratorsClientProps {
  competitionId: string;
  collaborators: CollaboratorRow[];
  isOrganizer: boolean;
  myPermissions: CollaboratorPermissions;
}

const PERMISSION_META: { key: keyof CollaboratorPermissions; label: string }[] = [
  { key: "canReview", label: "審核投稿" },
  { key: "canEditFormat", label: "賽制建立" },
  { key: "canEditSchedule", label: "時程設定" },
  { key: "canJudge", label: "評審評分" },
  { key: "canInvite", label: "邀請協作者" },
];

const EMPTY_PERMISSIONS: CollaboratorPermissions = {
  canReview: false,
  canEditFormat: false,
  canEditSchedule: false,
  canJudge: false,
  canInvite: false,
};

export function CollaboratorsClient({ competitionId, collaborators, isOrganizer, myPermissions }: CollaboratorsClientProps) {
  return (
    <div>
      {collaborators.length === 0 ? (
        <EmptyState icon="users" title="目前還沒有協作者" sub="邀請的人接受後，會出現在這裡並依權限使用管理後台" />
      ) : (
        <div className="mb-7 space-y-2.5">
          {collaborators.map((c) => (
            <CollaboratorCard key={c.id} collaborator={c} isOrganizer={isOrganizer} />
          ))}
        </div>
      )}

      {(isOrganizer || myPermissions.canInvite) && (
        <InviteForm competitionId={competitionId} isOrganizer={isOrganizer} myPermissions={myPermissions} />
      )}
    </div>
  );
}

function CollaboratorCard({ collaborator, isOrganizer }: { collaborator: CollaboratorRow; isOrganizer: boolean }) {
  const [permissions, setPermissions] = useState(collaborator.permissions);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  function toggle(key: keyof CollaboratorPermissions) {
    if (!isOrganizer) return;
    const next = { ...permissions, [key]: !permissions[key] };
    setPermissions(next);
    setError(null);
    startTransition(async () => {
      const result = await updateCollaboratorPermissions(collaborator.id, next);
      if ("error" in result) {
        setPermissions(permissions);
        setError(result.error);
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeCollaborator(collaborator.id);
      if ("error" in result) {
        setError(result.error);
      } else {
        setRemoved(true);
      }
    });
  }

  if (removed) return null;

  return (
    <div className="glass p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-panel-border bg-white/[0.04] text-[12px] font-semibold text-ink-dim">
            {collaborator.displayName.slice(0, 2)}
          </div>
          <span className="text-[13.5px] font-semibold">
            {collaborator.displayName}
            {collaborator.isSelf && <span className="ml-1.5 text-[11px] font-normal text-ink-faint">(你)</span>}
          </span>
        </div>
        {(isOrganizer || collaborator.isSelf) && (
          <button
            onClick={remove}
            disabled={isPending}
            className="flex items-center gap-1 rounded-[8px] border border-bad/30 px-2.5 py-1.25 text-[11.5px] text-bad transition-colors hover:bg-bad/8 disabled:opacity-45"
          >
            <Icon name="trash" size={12} />
            {collaborator.isSelf ? "退出協作" : "移除"}
          </button>
        )}
      </div>

      {error && <p className="mb-2.5 rounded-[9px] border border-bad/30 bg-bad/10 p-2 text-[11.5px] text-bad">{error}</p>}

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {PERMISSION_META.map((p) => (
          <label key={p.key} className={`flex items-center gap-2 text-[12px] text-ink-dim ${isOrganizer ? "" : "opacity-70"}`}>
            <Switch on={permissions[p.key]} onClick={() => toggle(p.key)} />
            {p.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function InviteForm({
  competitionId,
  isOrganizer,
  myPermissions,
}: {
  competitionId: string;
  isOrganizer: boolean;
  myPermissions: CollaboratorPermissions;
}) {
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<CollaboratorPermissions>(EMPTY_PERMISSIONS);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(key: keyof CollaboratorPermissions) {
    if (!isOrganizer && !myPermissions[key]) return;
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function invite() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await inviteCollaboratorByEmail(competitionId, email, permissions);
      if ("error" in result) {
        setError(result.error);
      } else {
        setEmail("");
        setPermissions(EMPTY_PERMISSIONS);
        setSuccess(true);
      }
    });
  }

  return (
    <div className="glass max-w-[560px] p-5">
      <div className="mb-3.5 text-[13.5px] font-semibold">邀請協作者</div>

      <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-dim">對方的 email</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="collaborator@example.com"
        className="mb-3.5 w-full rounded-[10px] border border-panel-border bg-black/25 px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/50"
      />
      <p className="mb-3.5 text-[11.5px] text-ink-faint">對方需要先用這個 email 登入過 SoundArena 一次，才找得到帳號。</p>

      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
        {PERMISSION_META.map((p) => {
          const capped = !isOrganizer && !myPermissions[p.key];
          return (
            <label
              key={p.key}
              className={`flex items-center gap-2 text-[12px] text-ink-dim ${capped ? "opacity-35" : ""}`}
              title={capped ? "你自己沒有這項權限，無法授予給別人" : undefined}
            >
              <Switch on={permissions[p.key]} onClick={() => toggle(p.key)} />
              {p.label}
            </label>
          );
        })}
      </div>

      {error && <p className="mb-3 rounded-[9px] border border-bad/30 bg-bad/10 p-2.5 text-[12px] text-bad">{error}</p>}
      {success && (
        <p className="mb-3 flex items-center gap-1.5 rounded-[9px] border border-ok/30 bg-ok/10 p-2.5 text-[12px] text-ok">
          <Icon name="check" size={13} /> 已送出邀請
        </p>
      )}

      <button
        onClick={invite}
        disabled={isPending || !email.trim()}
        className="rounded-[10px] bg-gradient-to-r from-[#ff9457] via-accent to-accent-2 px-4.5 py-2.5 text-[13.5px] font-semibold text-[#1a0e08] transition-opacity disabled:opacity-45"
      >
        {isPending ? "送出中…" : "送出邀請"}
      </button>
    </div>
  );
}
