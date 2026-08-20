-- 資安複查真實 PoC 確認兩個洞,根源都是同一件事(submissions 的 INSERT/UPDATE 只有
-- row-level RLS,沒有欄位限制):
--   1. submitEntry() 完全信任 client 傳來的 sharer_handle,自己不重新呼叫 Suno API 驗證
--      (程式碼註解直接寫「身份比對已經在呼叫這個 action 之前跑完」)——攻擊者可以繞過
--      verifySunoSharer(),直接帶假的 sharer_handle 送出投稿。
--   2. 就算 Suno 驗證這關擋住了,攻擊者仍可以直接 INSERT submissions 並在 payload 裡
--      夾帶 status='approved'、allow_public_playback=true,完全跳過主辦人審核,
--      而且這筆偽造「已通過」的投稿會被公開結果/公開試聽頁面當成真的。
-- 修法:submissions 的寫入全部收回,改成兩支 SECURITY DEFINER function。submit_entry()
-- 內部強制 status='pending_review',且比對 sharer_handle 是否等於報名時的 suno_handle
-- (defense in depth——Next.js 層還會用真正的 Suno API 重新驗證一次,見 submit/actions.ts
-- 的對應修改,這裡的比對是防止有人繞過 Next.js 直接打這支 RPC)。

revoke insert, update on submissions from authenticated;

create or replace function submit_entry(
  p_round_id uuid,
  p_registration_id uuid,
  p_suno_share_url text,
  p_title text,
  p_cover_image_url text,
  p_sharer_handle text,
  p_lyrics text,
  p_allow_public_playback boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_registration registrations%rowtype;
  v_round rounds%rowtype;
  v_submission_id uuid;
begin
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

  if lower(trim(p_sharer_handle)) <> lower(trim(v_registration.suno_handle)) then
    raise exception 'sharer handle does not match your registered suno handle';
  end if;

  insert into submissions (
    round_id, registration_id, suno_share_url, title, cover_image_url,
    sharer_handle, lyrics, allow_public_playback, status
  ) values (
    p_round_id, p_registration_id, p_suno_share_url, p_title, p_cover_image_url,
    p_sharer_handle, p_lyrics, p_allow_public_playback, 'pending_review'
  )
  returning id into v_submission_id;

  return v_submission_id;
end;
$$;

grant execute on function submit_entry(uuid, uuid, text, text, text, text, text, boolean) to authenticated;

create or replace function review_submission(p_submission_id uuid, p_status submission_status, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  select c.id into v_competition_id
  from submissions s
  join rounds r on r.id = s.round_id
  join competitions c on c.id = r.competition_id
  where s.id = p_submission_id;

  if v_competition_id is null then
    raise exception 'submission not found';
  end if;
  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to review this submission';
  end if;

  update submissions
  set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  where id = p_submission_id;
end;
$$;

grant execute on function review_submission(uuid, submission_status, text) to authenticated;
