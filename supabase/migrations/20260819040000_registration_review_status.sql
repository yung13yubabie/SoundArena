-- ADR-0008:報名新增審核關卡,防範惡意/灌水報名(使用者原話:比賽蟑螂)。
-- 刻意跟既有的 registrations.status(active/eliminated,淘汰用)分開,不共用同一個
-- 欄位——這是報名生命週期裡兩個獨立的維度,見 CONTEXT.md「RegistrationReviewStatus」詞條。

create type registration_review_status as enum ('pending_review', 'approved', 'rejected');

alter table registrations add column review_status registration_review_status not null default 'pending_review';
alter table registrations add column review_note text;

-- 既有的報名(這輪之前建立的,包含真實測試資料)一律視為已通過,不要讓這次 migration
-- 把已經在跑的投稿/投票/評分流程鎖死。
update registrations set review_status = 'approved';

-- ============================================================================
-- 主辦審核:走 SECURITY DEFINER function,不擴大既有的 blanket UPDATE policy
-- ============================================================================
-- registrations 現有的 "registrations updatable by organizer or collaborator" policy
-- 只綁 can_manage_competition(..., 'judge')——那是給 /judge 頁標記淘汰用的,審核報名
-- 概念上更接近審核投稿(review 權限),不應該連帶讓只有 judge 權限的人也能碰,也不應該
-- 反過來讓只有 review 權限的人碰到 status/eliminated_in_round_id 這種 judge 專用欄位。
-- RLS 是列級不是欄位級,這裡用 function 精確只開放 review_status/review_note 兩欄。
create or replace function review_registration(
  p_registration_id uuid,
  p_decision registration_review_status,
  p_note text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  select competition_id into v_competition_id from registrations where id = p_registration_id;
  if v_competition_id is null then
    raise exception 'registration not found';
  end if;

  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to review this registration';
  end if;

  update registrations
  set review_status = p_decision, review_note = p_note
  where id = p_registration_id;
end;
$$;

grant execute on function review_registration(uuid, registration_review_status, text) to authenticated;

-- ============================================================================
-- 本人重新送審:退回後可以改暱稱/Suno帳號重新報名,不限次數(ADR-0008)
-- ============================================================================
create or replace function resubmit_registration(
  p_registration_id uuid,
  p_display_name text,
  p_suno_handle text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_review_status registration_review_status;
begin
  select user_id, review_status into v_user_id, v_review_status
  from registrations where id = p_registration_id;

  if v_user_id is null then
    raise exception 'registration not found';
  end if;
  if v_user_id != auth.uid() then
    raise exception 'not your registration';
  end if;
  if v_review_status != 'rejected' then
    raise exception 'only a rejected registration can be resubmitted';
  end if;
  if trim(p_display_name) = '' or trim(p_suno_handle) = '' then
    raise exception 'display_name and suno_handle are required';
  end if;

  update registrations
  set display_name = trim(p_display_name), suno_handle = trim(p_suno_handle), review_status = 'pending_review', review_note = null
  where id = p_registration_id;
end;
$$;

grant execute on function resubmit_registration(uuid, text, text) to authenticated;
