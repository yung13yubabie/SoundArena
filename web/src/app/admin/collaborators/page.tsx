import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManageableCompetitions } from "@/lib/manageableCompetitions";
import { AdminShell } from "@/components/AdminShell";
import { CollaboratorsClient, type CollaboratorRow } from "./CollaboratorsClient";
import type { CollaboratorPermissions } from "./actions";

interface CollaboratorRawRow {
  id: string;
  user_id: string;
  can_review: boolean;
  can_edit_format: boolean;
  can_edit_schedule: boolean;
  can_judge: boolean;
  can_invite: boolean;
  profiles: { display_name: string | null; avatar_url: string | null } | { display_name: string | null; avatar_url: string | null }[] | null;
}

function oneProfile(value: CollaboratorRawRow["profiles"]) {
  return Array.isArray(value) ? value[0] : value;
}

function toPermissions(row: CollaboratorRawRow): CollaboratorPermissions {
  return {
    canReview: row.can_review,
    canEditFormat: row.can_edit_format,
    canEditSchedule: row.can_edit_schedule,
    canJudge: row.can_judge,
    canInvite: row.can_invite,
  };
}

const FULL_PERMISSIONS: CollaboratorPermissions = {
  canReview: true,
  canEditFormat: true,
  canEditSchedule: true,
  canJudge: true,
  canInvite: true,
};

const NO_PERMISSIONS: CollaboratorPermissions = {
  canReview: false,
  canEditFormat: false,
  canEditSchedule: false,
  canJudge: false,
  canInvite: false,
};

export default async function AdminCollaboratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: requestedId } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("host_setup_completed, is_platform_admin, host_revoked_at, host_approved_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_platform_admin && (!profile?.host_setup_completed || !profile?.host_approved_at || profile?.host_revoked_at)) {
    redirect("/admin/profile");
  }
  const isPlatformAdmin = profile.is_platform_admin ?? false;

  const myCompetitions = await getManageableCompetitions(supabase, "invite");

  const competitionList = myCompetitions.map((c) => ({ id: c.id, name: c.name }));
  const competition = requestedId
    ? myCompetitions.find((c) => c.id === requestedId)
    : myCompetitions[0];

  if (!competition) {
    return (
      <AdminShell active="collaborators" isPlatformAdmin={isPlatformAdmin}>
        <div className="mb-7">
          <h1 className="font-display text-[30px]">還沒有比賽可以管理協作者</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
            先到「賽制建立」頁建立比賽，或者等別人邀請你成為協作者。
          </p>
        </div>
      </AdminShell>
    );
  }

  const { data: collaboratorRows } = await supabase
    .from("competition_collaborators")
    .select(
      "id, user_id, can_review, can_edit_format, can_edit_schedule, can_judge, can_invite, profiles!competition_collaborators_user_id_fkey(display_name, avatar_url)",
    )
    .eq("competition_id", competition.id)
    .order("created_at");

  const rawRows = (collaboratorRows ?? []) as unknown as CollaboratorRawRow[];

  const collaborators: CollaboratorRow[] = rawRows.map((row) => {
    const prof = oneProfile(row.profiles);
    return {
      id: row.id,
      displayName: prof?.display_name ?? "未命名使用者",
      avatarUrl: prof?.avatar_url ?? null,
      permissions: toPermissions(row),
      isSelf: row.user_id === userId,
    };
  });

  const myRow = rawRows.find((r) => r.user_id === userId);
  const myPermissions: CollaboratorPermissions = competition.is_organizer
    ? FULL_PERMISSIONS
    : myRow
      ? toPermissions(myRow)
      : NO_PERMISSIONS;

  return (
    <AdminShell
      active="collaborators"
      competitions={competitionList}
      activeCompetitionId={competition.id}
      isPlatformAdmin={isPlatformAdmin}
    >
      <div className="mb-7">
        <h1 className="font-display text-[30px]">協作者 — {competition.name}</h1>
        <p className="mt-1.5 max-w-[680px] text-sm leading-relaxed text-ink-dim">
          {competition.is_organizer
            ? "邀請其他人幫忙管理這場比賽，個別勾選能碰哪些後台功能。權限異動與移除協作者只有你(主辦人)能做。"
            : "你是這場比賽的協作者。以下是目前的協作團隊；你只能邀請權限不超過自己的人。"}
        </p>
      </div>

      <CollaboratorsClient
        competitionId={competition.id}
        collaborators={collaborators}
        isOrganizer={competition.is_organizer}
        myPermissions={myPermissions}
      />
    </AdminShell>
  );
}
