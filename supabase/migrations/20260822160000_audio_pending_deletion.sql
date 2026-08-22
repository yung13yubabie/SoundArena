-- DB-08 資安複查(第三方稽核報告第二輪):delete_own_submission() 跟
-- delete_competition() 目前都是「先刪 DB 列、再讓 Next.js 那層盡力去 B2 刪檔案」。
-- SA-006/ADR-0026 已經確立的原則是「B2 沒刪成功就保留 DB 上的 audio_object_key,
-- 讓下次 cron 自然重試」——但這兩支 RPC 刪的是整列(submissions/competitions 本身),
-- 一旦那一列真的被刪掉,audio_object_key 就從任何一張表上徹底消失,B2 那份檔案
-- 變成完全沒有任何紀錄可以追蹤的真孤兒,cleanup-audio cron 也掃不到它。
--
-- 修法比照 ADR-0026 的 pending_uploads 孤兒追蹤精神:在真的刪除那一列之前,先把
-- 即將被留在 B2 的 audio_object_key 寫進這張獨立的追蹤表,DB 那筆列刪不刪都不影響
-- 這裡的紀錄——cron 之後專門掃這張表、確認 B2 真的刪除成功才把追蹤紀錄清掉,失敗
-- 就留著等下次重試(跟 pending_uploads 孤兒掃描同一套邏輯)。
--
-- 只有 service_role(cron)跟這兩支 security definer RPC(以 table owner 身份執行,
-- 不受 RLS 限制)需要碰這張表——一般 authenticated/anon 完全不需要、也不該有任何
-- 存取權,所以除了啟用 RLS(預設拒絕、不給任何 policy)之外,額外明確
-- revoke(這個 session 已經在 function GRANT 上踩過一次「Supabase 建表/建函式預設
-- 隱含授予 PUBLIC」的坑,這裡雙重保險,不只靠 RLS 一層)。
create table audio_pending_deletion (
  id uuid primary key default gen_random_uuid(),
  object_key text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table audio_pending_deletion enable row level security;
revoke all on audio_pending_deletion from public, anon, authenticated;

create index audio_pending_deletion_created_at_idx on audio_pending_deletion (created_at);

-- delete_own_submission():簽章(uuid -> text)沒變,create or replace 就夠,不用 drop。
create or replace function delete_own_submission(p_submission_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_registration_user_id uuid;
  v_voting_opens_at timestamptz;
  v_audio_object_key text;
begin
  select reg.user_id, r.voting_opens_at, s.audio_object_key
    into v_registration_user_id, v_voting_opens_at, v_audio_object_key
  from submissions s
  join registrations reg on reg.id = s.registration_id
  join rounds r on r.id = s.round_id
  where s.id = p_submission_id;

  if v_registration_user_id is null then
    raise exception 'submission not found';
  end if;
  if v_registration_user_id <> auth.uid() then
    raise exception 'not your submission';
  end if;
  if v_voting_opens_at is not null and now() >= v_voting_opens_at then
    raise exception 'voting has already opened for this round, cannot delete';
  end if;

  delete from submissions where id = p_submission_id;

  if v_audio_object_key is not null then
    insert into audio_pending_deletion (object_key, reason) values (v_audio_object_key, 'submission_delete');
  end if;

  return v_audio_object_key;
end;
$$;

-- delete_competition():回傳型別從 void 改成 text[](這場比賽底下所有投稿的
-- audio_object_key,交給 Next.js 那層盡力立即清 B2,cron 兜底重試)——回傳型別
-- 變更,照這個 session 已確立的規則必須先 drop 再 create,不能直接 create or replace。
drop function if exists delete_competition(uuid);

create function delete_competition(p_competition_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_is_organizer boolean;
  v_locked_id uuid;
  v_registration_count int;
  v_audio_keys text[];
begin
  select is_competition_organizer(p_competition_id) into v_is_organizer;

  if not v_is_organizer and not is_platform_admin() then
    raise exception 'insufficient permission to delete this competition';
  end if;

  select id into v_locked_id from competitions where id = p_competition_id for update;
  if v_locked_id is null then
    raise exception 'competition not found';
  end if;

  if not is_platform_admin() then
    select count(*) into v_registration_count from registrations where competition_id = p_competition_id;
    if v_registration_count > 0 then
      raise exception 'this competition already has real registrations — ask a platform admin to delete it';
    end if;
  end if;

  select array_agg(s.audio_object_key) into v_audio_keys
  from submissions s
  join rounds r on r.id = s.round_id
  where r.competition_id = p_competition_id and s.audio_object_key is not null;

  if v_audio_keys is not null then
    insert into audio_pending_deletion (object_key, reason)
    select unnest(v_audio_keys), 'competition_delete';
  end if;

  delete from competitions where id = p_competition_id;

  return coalesce(v_audio_keys, array[]::text[]);
end;
$$;

grant execute on function delete_competition(uuid) to authenticated;
revoke execute on function delete_competition(uuid) from public, anon;
