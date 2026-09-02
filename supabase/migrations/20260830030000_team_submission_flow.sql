-- Phase 3:隊伍共用投稿流程。grilling 確認:隊內任何人都能上傳候選版本(各自
-- 紀錄上傳者、投稿擁有權不轉移),只有隊長能執行「正式送出」把某個候選版本標記
-- 成這隊的官方投稿,未選中的候選版本保留當歷史紀錄。投稿截止時隊長還沒送出,
-- 系統自動選最後一筆候選送出。

-- submit_entry() 擴充 p_team_id(預設 null,個人賽不受影響)。驗證:提供 team_id
-- 時,這個 registration 必須真的是這支隊伍的成員。
drop function submit_entry(uuid, uuid, uuid, text, text, text, text, text, boolean, text, text, boolean);

create function submit_entry(
  p_round_id uuid,
  p_registration_id uuid,
  p_caller_user_id uuid,
  p_suno_share_url text,
  p_title text,
  p_cover_image_url text,
  p_sharer_handle text,
  p_lyrics text,
  p_allow_public_playback boolean,
  p_audio_object_key text default null,
  p_process_doc text default null,
  p_ethical_sourcing_declared boolean default false,
  p_team_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_registration registrations%rowtype;
  v_round rounds%rowtype;
  v_submission_id uuid;
begin
  if p_caller_user_id is null then
    raise exception 'caller user id is required';
  end if;

  if p_suno_share_url !~ '^https://suno\.com/s/[A-Za-z0-9]+$' then
    raise exception 'suno_share_url must be a canonical https://suno.com/s/<code> link';
  end if;

  if p_audio_object_key is not null and p_audio_object_key !~ '^submissions/[A-Za-z0-9-]+/[A-Za-z0-9._-]+$' then
    raise exception 'invalid audio_object_key format';
  end if;

  if p_process_doc is not null and length(p_process_doc) > 20000 then
    raise exception 'process_doc must be 20000 characters or fewer';
  end if;

  select * into v_registration from registrations where id = p_registration_id;
  if v_registration.id is null then
    raise exception 'registration not found';
  end if;
  if v_registration.user_id <> p_caller_user_id then
    raise exception 'not your registration';
  end if;
  if v_registration.review_status <> 'approved' then
    raise exception 'registration is not approved yet';
  end if;
  if v_registration.status <> 'active' then
    raise exception 'registration is eliminated, cannot submit';
  end if;

  select * into v_round from rounds where id = p_round_id;
  if v_round.id is null then
    raise exception 'round not found';
  end if;
  if v_round.competition_id <> v_registration.competition_id then
    raise exception 'round does not belong to your competition';
  end if;
  if not v_round.allows_new_submissions then
    raise exception 'this round is not accepting submissions';
  end if;
  if v_round.submission_opens_at is not null and now() < v_round.submission_opens_at then
    raise exception 'submissions have not opened yet for this round';
  end if;
  if v_round.submission_closes_at is not null and now() >= v_round.submission_closes_at then
    raise exception 'submission window has closed for this round';
  end if;

  if lower(trim(p_sharer_handle)) <> lower(trim(v_registration.suno_handle)) then
    raise exception 'sharer handle does not match your registered suno handle';
  end if;

  if p_audio_object_key is not null and p_audio_object_key !~ ('^submissions/' || p_registration_id::text || '/') then
    raise exception 'audio_object_key does not belong to this registration';
  end if;

  if p_team_id is not null and not exists (
    select 1 from team_members where team_id = p_team_id and registration_id = p_registration_id
  ) then
    raise exception 'you are not a member of this team';
  end if;

  insert into submissions (
    round_id, registration_id, suno_share_url, title, cover_image_url,
    sharer_handle, lyrics, allow_public_playback, status, audio_object_key,
    process_doc, ethical_sourcing_declared, team_id
  ) values (
    p_round_id, p_registration_id, p_suno_share_url, p_title, p_cover_image_url,
    p_sharer_handle, p_lyrics, p_allow_public_playback, 'pending_review', p_audio_object_key,
    p_process_doc, p_ethical_sourcing_declared, p_team_id
  )
  returning id into v_submission_id;

  if p_audio_object_key is not null then
    update pending_uploads set consumed_at = now() where object_key = p_audio_object_key and consumed_at is null;
  end if;

  return v_submission_id;
end;
$$;
grant execute on function submit_entry(uuid, uuid, uuid, text, text, text, text, text, boolean, text, text, boolean, uuid) to service_role;

-- 隊長從候選版本裡選一筆正式送出。只有隊長本人能執行,同隊同輪次只會有一筆
-- is_team_selected=true(unique index 已經在 schema migration 保證)。
create or replace function select_team_submission(p_submission_id uuid, p_caller_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_round_id uuid;
  v_captain_registration_id uuid;
  v_captain_user_id uuid;
begin
  select team_id, round_id into v_team_id, v_round_id from submissions where id = p_submission_id;
  if v_team_id is null then
    raise exception 'submission not found or not a team submission';
  end if;

  select t.captain_registration_id, r.user_id into v_captain_registration_id, v_captain_user_id
  from teams t join registrations r on r.id = t.captain_registration_id
  where t.id = v_team_id;

  if v_captain_user_id is distinct from p_caller_user_id then
    raise exception 'only the team captain can select the official submission';
  end if;

  update submissions set is_team_selected = false where team_id = v_team_id and round_id = v_round_id;
  update submissions set is_team_selected = true where id = p_submission_id;
end;
$$;
grant execute on function select_team_submission(uuid, uuid) to service_role;

-- 隊長轉讓。呼叫者必須是目前的隊長,或對這場比賽有 review 權限的主辦人/協作者
-- (給主辦人一個手動介入的後路,例如隊長帳號無法使用時)。新隊長必須是這支隊伍
-- 的既有成員。
create or replace function transfer_team_captain(p_team_id uuid, p_new_captain_registration_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_captain_registration_id uuid;
  v_competition_id uuid;
begin
  select t.captain_registration_id, rd.competition_id into v_captain_registration_id, v_competition_id
  from teams t join rounds rd on rd.id = t.round_id
  where t.id = p_team_id;

  if v_competition_id is null then
    raise exception 'team not found';
  end if;

  if not (
    can_manage_competition(v_competition_id, 'review')
    or exists (select 1 from registrations cur where cur.id = v_captain_registration_id and cur.user_id = auth.uid())
  ) then
    raise exception 'insufficient permission to transfer team captain';
  end if;

  if not exists (select 1 from team_members where team_id = p_team_id and registration_id = p_new_captain_registration_id) then
    raise exception 'new captain must be an existing member of this team';
  end if;

  update teams set captain_registration_id = p_new_captain_registration_id where id = p_team_id;
end;
$$;
grant execute on function transfer_team_captain(uuid, uuid) to authenticated;
