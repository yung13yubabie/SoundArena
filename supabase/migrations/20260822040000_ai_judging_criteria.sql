-- 使用者這輪明確要求:評審跟觀眾投票要是兩套完全不同的評分邏輯——評審只評
-- 「AI 的使用方式」(技術新意、歌曲工藝紮實度、人本創作過程、倫理數據來源、
-- 過程透明度),觀眾投票評「整體吸引力」(沿用既有的 vote 模板,不動)。
--
-- 決策記錄(使用者這輪明確選擇,不是自行假設):
-- 1. 評審分數跟觀眾投票分數依然走現有的加權總分模式(scoring_rules/score_items),
--    不強制拆成兩個獨立排名——主辦人自己決定評審項目跟投票項目的權重比例。
-- 2. Process Doc(逐工具逐 prompt 交代創作過程)用自由長文字欄位,不做結構化表單。
-- 3. 倫理數據來源(呼應 2023 年起出現的公平訓練/版權旗標系統)採自申制標籤,平台
--    不驗證任何工具白名單,完全靠評審自行判斷可信度。
-- 4. 這套新評分邏輯只當作新的 score_item_templates 選項,不取代/不遷移既有比賽
--    的計分規則——主辦人建立新比賽時自己選要不要用。

alter table submissions add column process_doc text;
alter table submissions add column ethical_sourcing_declared boolean not null default false;
alter table submissions add constraint submissions_process_doc_length check (process_doc is null or length(process_doc) <= 20000);

insert into score_item_templates (key, label, description, default_kind) values
  ('ai_technical_novelty', 'AI 技術新意', 'AI 用法有沒有自己的想法,不是套版跑一次生成', 'weighted'),
  ('craftsmanship', '歌曲工藝', '編曲、製作、完整度是否紮實,不是自嗨 demo', 'weighted'),
  ('human_process', '人本創作過程', '評審最在意的是人使用 AI 時失敗、掙扎、驚喜的真實過程,不是技術本身多炫', 'weighted'),
  ('ethical_sourcing', '倫理數據來源', '參賽者是否使用標榜公平訓練、尊重版權的工具(自申制標籤,平台不驗證)', 'weighted'),
  ('process_transparency', '過程透明度', 'Process Doc 是否逐工具逐 prompt 交代創作過程,結構是否完整', 'weighted');

-- 簽章多了兩個新參數,依 ADR-0018/0020 學到的教訓:先明確 drop 掉舊簽章,
-- 不能只靠加預設值蒙混過去,否則會產生重載讓 PostgREST 判斷不出該呼叫哪一個。
drop function submit_entry(uuid, uuid, text, text, text, text, text, boolean, text);

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

  return v_submission_id;
end;
$$;

-- judge_submissions_for_round() 也要回傳 process_doc/ethical_sourcing_declared,
-- 不然評審沒有任何依據可以評「人本過程」「倫理來源」「過程透明度」這三項——
-- 這兩個都不是身份欄位,加進匿名安全的 RPC 沒有違反 ADR-0020 的邊界。
-- RETURNS TABLE 的輸出欄位變了,create or replace 對「改變回傳型別」這件事會直接
-- 報錯(跟改參數列表是不同的限制),要先 drop 再建立。
drop function judge_submissions_for_round(uuid);

create function judge_submissions_for_round(p_round_id uuid)
returns table(
  submission_id uuid,
  title text,
  registration_id uuid,
  registration_status text,
  process_doc text,
  ethical_sourcing_declared boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  select competition_id into v_competition_id from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;
  if not can_manage_competition(v_competition_id, 'judge') then
    raise exception 'insufficient permission to judge this round';
  end if;

  return query
    select s.id, s.title, r.id, r.status::text, s.process_doc, s.ethical_sourcing_declared
    from submissions s
    join registrations r on r.id = s.registration_id
    where s.round_id = p_round_id and s.status = 'approved';
end;
$$;
grant execute on function judge_submissions_for_round(uuid) to authenticated;
