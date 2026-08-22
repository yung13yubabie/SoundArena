-- 第三方 SaaS 稽核報告獨立複查後確認屬實(ADR-0020 SA-002):報名/投稿截止時間
-- 目前只是 UI 判斷,真正決定能不能寫入的 DB 層完全沒檢查。
--
-- 報名:registrations 的 INSERT policy 只查 auth.uid() = user_id,沒碰
-- competitions.registration_opens_at/registration_closes_at。
--
-- 投稿:submit_entry() 原本只檢查 rounds.allows_new_submissions——這個欄位從
-- schema 建立以來,整個程式碼庫沒有任何一處把它寫成 false(可以用
-- `grep -rn allows_new_submissions` 驗證,唯一出現的地方是預設值 true 跟這條
-- 檢查本身),等於這個檢查形同虛設。真正的 rounds.submission_opens_at/
-- submission_closes_at 只有 /admin/schedule 寫入,沒有任何地方讀取比對。
--
-- 這個 migration 把兩條路徑的截止時間收進 DB 層,讓它變成使用者無法繞過 UI
-- 逃脫的硬性邊界。resubmit_registration()(退回後重新送出報名)語意上等同
-- 「再報名一次」,套用同一個時間窗規則。

drop policy "registrations insertable by self" on registrations;
create policy "registrations insertable by self" on registrations for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from competitions c
    where c.id = registrations.competition_id
      and (c.registration_opens_at is null or now() >= c.registration_opens_at)
      and (c.registration_closes_at is null or now() < c.registration_closes_at)
  )
);

create or replace function resubmit_registration(
  p_registration_id uuid,
  p_display_name text,
  p_suno_handle text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_review_status registration_review_status;
  v_last_resubmitted_at timestamptz;
  v_competition_id uuid;
  v_cooldown interval := interval '10 minutes';
  v_wait_seconds int;
begin
  select user_id, review_status, last_resubmitted_at, competition_id
    into v_user_id, v_review_status, v_last_resubmitted_at, v_competition_id
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

  if not exists (
    select 1 from competitions c
    where c.id = v_competition_id
      and (c.registration_opens_at is null or now() >= c.registration_opens_at)
      and (c.registration_closes_at is null or now() < c.registration_closes_at)
  ) then
    raise exception 'registration window is closed for this competition';
  end if;

  if v_last_resubmitted_at is not null and v_last_resubmitted_at > now() - v_cooldown then
    v_wait_seconds := ceil(extract(epoch from (v_last_resubmitted_at + v_cooldown - now())));
    raise exception 'resubmit cooldown: wait % seconds', v_wait_seconds;
  end if;

  update registrations
  set
    display_name = trim(p_display_name),
    suno_handle = trim(p_suno_handle),
    review_status = 'pending_review',
    review_note = null,
    last_resubmitted_at = now()
  where id = p_registration_id;
end;
$$;

-- 簽章跟 20260821150000_submit_entry_audio_object_key.sql 完全一致,create or
-- replace 會直接取代,不會產生重載(那個坑已經在 ADR-0018 踩過一次)。
create or replace function submit_entry(
  p_round_id uuid,
  p_registration_id uuid,
  p_suno_share_url text,
  p_title text,
  p_cover_image_url text,
  p_sharer_handle text,
  p_lyrics text,
  p_allow_public_playback boolean,
  p_audio_object_key text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_registration registrations%rowtype;
  v_round rounds%rowtype;
  v_submission_id uuid;
begin
  if p_suno_share_url !~ '^https://suno\.com/s/[A-Za-z0-9]+$' then
    raise exception 'suno_share_url must be a canonical https://suno.com/s/<code> link';
  end if;

  if p_audio_object_key is not null and p_audio_object_key !~ '^submissions/[A-Za-z0-9-]+/[A-Za-z0-9._-]+$' then
    raise exception 'invalid audio_object_key format';
  end if;

  select * into v_registration from registrations where id = p_registration_id;
  if v_registration.id is null then
    raise exception 'registration not found';
  end if;
  if v_registration.user_id <> auth.uid() then
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

  -- 存進去的 audio_object_key 一定要屬於這個報名者自己(見 requestAudioUpload()
  -- 產生 key 的規則:submissions/{registration_id}/...),防止有人把別人上傳好的
  -- key 直接填進來冒用。
  if p_audio_object_key is not null and p_audio_object_key !~ ('^submissions/' || p_registration_id::text || '/') then
    raise exception 'audio_object_key does not belong to this registration';
  end if;

  insert into submissions (
    round_id, registration_id, suno_share_url, title, cover_image_url,
    sharer_handle, lyrics, allow_public_playback, status, audio_object_key
  ) values (
    p_round_id, p_registration_id, p_suno_share_url, p_title, p_cover_image_url,
    p_sharer_handle, p_lyrics, p_allow_public_playback, 'pending_review', p_audio_object_key
  )
  returning id into v_submission_id;

  return v_submission_id;
end;
$$;
