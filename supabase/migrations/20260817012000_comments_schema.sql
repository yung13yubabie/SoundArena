-- ADR-0004: Comment + CommentEndorsement——任何登入使用者可留言,Submission 原作者
-- 給 0–100% 認可度,留言者當輪的投稿依認可度取得加分(是 WeightedScoreItem,不是
-- 無上限的 BonusScoreItem)。留言/認可只在該輪身份揭露後開放。

create table comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  commenter_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  endorsement_percent numeric(5, 2) not null default 0 check (endorsement_percent >= 0 and endorsement_percent <= 100),
  endorsed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger comments_set_updated_at before update on comments
  for each row execute function set_updated_at();

create index idx_comments_submission on comments(submission_id);
create index idx_comments_commenter on comments(commenter_id);

-- 不能留言給自己的作品——跟 votes 的 check_vote_validity 同一種規則,寫成 trigger
-- 不是 RLS,理由一致:這是「跟身份比對有關的業務規則」,不是單純的存取範圍判斷。
create or replace function check_comment_not_self()
returns trigger language plpgsql as $$
declare
  submission_owner uuid;
begin
  select reg.user_id into submission_owner
  from submissions s
  join registrations reg on reg.id = s.registration_id
  where s.id = new.submission_id;

  if submission_owner is null then
    raise exception 'submission % not found', new.submission_id;
  end if;

  if submission_owner = new.commenter_id then
    raise exception 'cannot comment on your own submission';
  end if;

  return new;
end;
$$;

create trigger comments_check_not_self
  before insert on comments
  for each row execute function check_comment_not_self();

-- ============================================================================
-- Helper functions
-- ============================================================================

-- 讓 comments 的可見性判斷不用依賴 submissions 自己的 RLS(submissions 的公開
-- 讀取綁在「投稿者自己選不選擇公開試聽」這個跟留言完全無關的開關上)。
create or replace function submission_round_id(p_submission_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select round_id from submissions where id = p_submission_id;
$$;

-- 跟 get_round_submissions/get_round_scores 用同一套「這輪身份揭不揭露」邏輯
-- (fully_public 一開始就公開;per_round_anonymous 該輪投票一截止就公開;
-- full_anonymous_until_final 只有決賽截止才一次公開全部)——這裡抽成獨立 function,
-- 下一個 migration 會把 get_round_submissions 也改成呼叫這個,不要兩邊各自維護一份。
create or replace function round_identity_revealed(p_round_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_anonymity anonymity_mode;
  v_round_index int;
  v_max_round_index int;
  v_voting_closes_at timestamptz;
  v_competition_id uuid;
begin
  if p_round_id is null then
    return false;
  end if;

  select c.anonymity_mode, r.round_index, r.competition_id, r.voting_closes_at
    into v_anonymity, v_round_index, v_competition_id, v_voting_closes_at
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;

  if v_competition_id is null then
    return false;
  end if;

  if v_anonymity = 'fully_public' then
    return true;
  end if;

  if v_voting_closes_at is null or v_voting_closes_at > now() then
    return false;
  end if;

  if v_anonymity = 'per_round_anonymous' then
    return true;
  end if;

  -- full_anonymous_until_final
  select max(round_index) into v_max_round_index from rounds where competition_id = v_competition_id;
  return v_round_index = v_max_round_index;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================

alter table comments enable row level security;

create policy "comments readable when round revealed" on comments for select using (
  round_identity_revealed(submission_round_id(submission_id))
);

create policy "comments insertable by anyone once revealed" on comments for insert with check (
  auth.uid() = commenter_id
  and endorsement_percent = 0
  and round_identity_revealed(submission_round_id(submission_id))
);

-- 只有原作者能改認可度;欄位級授權(見下)另外把「能改哪些欄位」鎖到只剩
-- endorsement_percent/endorsed_at,理由跟這次 profiles 欄位授權踩過的坑一樣——
-- RLS 是列級,擋不住「這一列裡的其他欄位」被一起改掉(例如留言內容、commenter_id)。
create policy "comments endorsable by submission owner" on comments for update using (
  exists (
    select 1 from submissions s
    join registrations reg on reg.id = s.registration_id
    where s.id = comments.submission_id and reg.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from submissions s
    join registrations reg on reg.id = s.registration_id
    where s.id = comments.submission_id and reg.user_id = auth.uid()
  )
);

create policy "comments deletable by commenter" on comments for delete using (auth.uid() = commenter_id);

-- 08-16 深夜第四輪踩過:REVOKE 只下給 anon/authenticated 個別角色不會生效,Supabase
-- 建表時的預設 GRANT 是下給 PUBLIC 這個偽角色,欄位權限判斷是「table-level 授權 OR
-- column-level 授權」,table-level 的 PUBLIC 授權不收乾淨,column-level REVOKE 完全無效。
revoke update on comments from public, authenticated, anon;
grant update (endorsement_percent, endorsed_at) on comments to authenticated;
