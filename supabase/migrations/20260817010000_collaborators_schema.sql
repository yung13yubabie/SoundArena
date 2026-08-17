-- ADR-0003: Collaborator——一場 Competition 仍然只有一位 Organizer(擁有者,不可轉讓),
-- 但 Organizer 可以邀請任意數量 Collaborator,並個別勾選五項權限。
--
-- 權限分五類,對應現有五個管理後台頁面:
--   can_review        → /admin/review(審核投稿)
--   can_edit_format   → /admin/format(賽制建立,含 competitions 基本資料/rounds/scoring_rules/score_items/round_format_blocks)
--   can_edit_schedule → /admin/schedule(時程設定,同樣會寫 competitions 跟 rounds 的時間欄位)
--   can_judge         → /judge(評審評分:submission_scores、votes 讀取、registrations 淘汰標記)
--   can_invite        → 邀請其他 Collaborator(預設只有 Organizer 有,可授予)

create table competition_collaborators (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  can_review boolean not null default false,
  can_edit_format boolean not null default false,
  can_edit_schedule boolean not null default false,
  can_judge boolean not null default false,
  can_invite boolean not null default false,
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, user_id)
);

create trigger competition_collaborators_set_updated_at before update on competition_collaborators
  for each row execute function set_updated_at();

create index idx_competition_collaborators_competition on competition_collaborators(competition_id);
create index idx_competition_collaborators_user on competition_collaborators(user_id);

-- ============================================================================
-- Helper functions(都用 SECURITY DEFINER——理由跟 is_platform_admin() 一樣:
-- 這幾個 function 會被其他表的 RLS policy 呼叫,也會被 competition_collaborators
-- 自己的 policy 呼叫,任何一邊用行內 subquery 查自己的表都有 20260816100724 那次
-- 踩過的無限遞迴風險。)
-- ============================================================================

create or replace function is_competition_organizer(p_competition_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from competitions c where c.id = p_competition_id and c.organizer_id = auth.uid());
$$;

create or replace function is_competition_collaborator(p_competition_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competition_collaborators cc
    where cc.competition_id = p_competition_id and cc.user_id = auth.uid()
  );
$$;

-- p_permission ∈ ('review','format','schedule','judge','invite')
create or replace function has_collaborator_permission(p_competition_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competition_collaborators cc
    where cc.competition_id = p_competition_id
      and cc.user_id = auth.uid()
      and (
        (p_permission = 'review' and cc.can_review)
        or (p_permission = 'format' and cc.can_edit_format)
        or (p_permission = 'schedule' and cc.can_edit_schedule)
        or (p_permission = 'judge' and cc.can_judge)
        or (p_permission = 'invite' and cc.can_invite)
      )
  );
$$;

-- Organizer 永遠有全部權限;Collaborator 要看個別授權。管理頁的 RLS 一律呼叫這個,
-- 不要直接呼叫 has_collaborator_permission(否則會漏掉「本人是 Organizer」的情況。
create or replace function can_manage_competition(p_competition_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select is_competition_organizer(p_competition_id) or has_collaborator_permission(p_competition_id, p_permission);
$$;

-- ============================================================================
-- RLS: competition_collaborators 自己這張表
-- ============================================================================

alter table competition_collaborators enable row level security;

create policy "collaborators readable by organizer" on competition_collaborators for select using (
  is_competition_organizer(competition_id)
);
create policy "collaborators readable by fellow collaborators" on competition_collaborators for select using (
  is_competition_collaborator(competition_id)
);

create policy "collaborators insertable by organizer" on competition_collaborators for insert with check (
  is_competition_organizer(competition_id)
);
-- 有 invite 權限的 Collaborator 也能邀人,但只能給出「自己也有」的權限子集——
-- 不能讓一個只有 review+invite 的協作者,邀進來一個 format+judge+invite 全開的人。
create policy "collaborators insertable by invite-permission collaborator" on competition_collaborators for insert with check (
  has_collaborator_permission(competition_id, 'invite')
  and (not can_review or has_collaborator_permission(competition_id, 'review'))
  and (not can_edit_format or has_collaborator_permission(competition_id, 'format'))
  and (not can_edit_schedule or has_collaborator_permission(competition_id, 'schedule'))
  and (not can_judge or has_collaborator_permission(competition_id, 'judge'))
  and (not can_invite or has_collaborator_permission(competition_id, 'invite'))
);

-- 權限異動(改誰能做什麼)只有 Organizer 能做——比邀請本身更敏感,不下放給
-- invite 權限的協作者,避免協作者互相調高彼此權限。
create policy "collaborators updatable by organizer" on competition_collaborators for update using (
  is_competition_organizer(competition_id)
) with check (
  is_competition_organizer(competition_id)
);

create policy "collaborators deletable by organizer" on competition_collaborators for delete using (
  is_competition_organizer(competition_id)
);
create policy "collaborators can remove themselves" on competition_collaborators for delete using (
  user_id = auth.uid()
);
