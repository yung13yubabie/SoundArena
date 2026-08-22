-- SA-003 剩餘三項(quota / provisional upload 生命週期 + 孤兒檔案回收 / MIME 內容驗證)
-- 之前故意分開處理(ADR-0023 先修最嚴重的簽章大小綁定)。這個 migration 補上剩下的
-- 部分共同需要的資料模型:誰在什麼時候申請了一個 upload URL、宣稱的 content-type
-- 是什麼、後來有沒有真的被一筆投稿吃掉。
--
-- 不用「provisional → confirmed」狀態欄位,改用 consumed_at timestamptz(null =
-- 還沒被任何投稿吃掉,非 null = 已經被 submit_entry() 吃掉的時間點)——跟 SA-006
-- 的 audio_object_key 保留手法一致精神:用「有沒有值」表示狀態,不用額外的 enum。

create table pending_uploads (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  object_key text not null unique,
  content_type text not null,
  declared_size bigint not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index idx_pending_uploads_registration on pending_uploads(registration_id);
create index idx_pending_uploads_orphan_scan on pending_uploads(created_at) where consumed_at is null;

alter table pending_uploads enable row level security;

create policy "pending_uploads insertable by registration owner" on pending_uploads for insert with check (
  exists (select 1 from registrations r where r.id = pending_uploads.registration_id and r.user_id = auth.uid())
);
create policy "pending_uploads readable by registration owner" on pending_uploads for select using (
  exists (select 1 from registrations r where r.id = pending_uploads.registration_id and r.user_id = auth.uid())
);

-- submit_entry() 簽章跟回傳型別都沒變,只是內部多一步:真的被拿來投稿的
-- audio_object_key,對應的 pending_uploads 列標記 consumed_at,讓 cron 的孤兒
-- 掃描知道這個物件「已經有主」,不該被當成廢棄上傳清掉。
create or replace function submit_entry(
  p_round_id uuid,
  p_registration_id uuid,
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
