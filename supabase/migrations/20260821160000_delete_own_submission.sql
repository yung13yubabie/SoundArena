-- 使用者要求:投稿後如果還沒到投票,想刪除重新上傳。目前完全沒有刪除投稿的路徑
-- (submissions 只能被 submit_entry() 新增、review_submission() 改狀態)。
--
-- 只允許本人、只允許這一輪投票還沒開始(now() < voting_opens_at,或根本還沒設定
-- 投票時間)的情況下刪除——投票一旦開始,刪除投稿會讓已經投給這篇作品的票變成
-- 孤兒資料(cascade 會把 votes 也刪掉,等於默默抹掉別人已經投出去的票),這是
-- 不能接受的,所以投票開始後一律不給刪,只能請主辦人退回重審。
--
-- 回傳 audio_object_key(可能是 null)給呼叫端——B2 上的檔案要在 Next.js 那層
-- 呼叫 deleteAudioObject() 清掉,Postgres 沒辦法直接打 B2 API。

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
  return v_audio_object_key;
end;
$$;

grant execute on function delete_own_submission(uuid) to authenticated;
