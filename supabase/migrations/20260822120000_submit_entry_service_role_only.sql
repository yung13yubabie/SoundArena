-- DB-02(第三方稽核複查,第二輪報告):submit_entry() 從 20260820030000 開始就
-- grant execute to authenticated——這是刻意的設計(讓一般使用者 session 能直接呼叫),
-- 但代價是 Next.js 的 submitEntry() Server Action 做的外部驗證(重打 Suno API 確認
-- 分享連結真的屬於這個帳號、Range GET 音檔開頭 bytes 驗證 magic bytes)完全是「client
-- 端多做的好意」,不是真正的 security invariant——任何人都可以跳過 Server Action,
-- 直接對 PostgREST 打 submit_entry(),繞過這兩層外部驗證,DB 這邊只檢查得到格式/
-- 字串比對層級的東西(sharer_handle 字串是否等於報名時填的值、audio_object_key
-- 的路徑前綴是否屬於自己的 registration_id),驗證不到「這個 Suno 連結真的是這個
-- handle 分享的」「這個音檔真的是音訊格式」。
--
-- 這個 session 稍早的 PoC(poc_sa001_sa002.js)剛好就是用 authenticated client 直接
-- 呼叫 submit_entry() 成功——當時是拿來測 SA-002 的截止時間檢查,沒特別注意到這件事
-- 本身就是 DB-02 的具體證據:一般使用者 session 真的能繞過 Server Action。
--
-- 修法跟這個 session 已經用過的手法一致(registrations/votes/submission_scores):
-- revoke 掉 authenticated 的直接呼叫權,只留 service_role 能呼叫——Next.js 的
-- submitEntry() 完成 Suno/MIME 驗證後,改用 service_role 呼叫這支 RPC,並且明確
-- 傳入已經驗證過的 caller user id(不能繼續依賴 auth.uid(),因為 service_role
-- 呼叫下 auth.uid() 會是 null——這個 session 稍早處理 revoke_organizer()/cron
-- cleanup 時就踩過同一個坑)。

drop function submit_entry(uuid, uuid, text, text, text, text, text, boolean, text, text, boolean);

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
  p_ethical_sourcing_declared boolean default false
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

  insert into submissions (
    round_id, registration_id, suno_share_url, title, cover_image_url,
    sharer_handle, lyrics, allow_public_playback, status, audio_object_key,
    process_doc, ethical_sourcing_declared
  ) values (
    p_round_id, p_registration_id, p_suno_share_url, p_title, p_cover_image_url,
    p_sharer_handle, p_lyrics, p_allow_public_playback, 'pending_review', p_audio_object_key,
    p_process_doc, p_ethical_sourcing_declared
  )
  returning id into v_submission_id;

  if p_audio_object_key is not null then
    update pending_uploads set consumed_at = now() where object_key = p_audio_object_key and consumed_at is null;
  end if;

  return v_submission_id;
end;
$$;

-- 明確只留 service_role——不 grant 給 authenticated/anon/public,直接對
-- PostgREST 打這支 RPC 一律 42501 permission denied。
grant execute on function submit_entry(uuid, uuid, uuid, text, text, text, text, text, boolean, text, text, boolean) to service_role;
