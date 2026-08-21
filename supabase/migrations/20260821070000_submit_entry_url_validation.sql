-- 獨立複查抓到:submit_entry() 只比對 sharer_handle,完全不驗證 p_suno_share_url
-- 本身的網域。繞過 Next.js 直接打這支 RPC 的人,可以帶一個真實有效的 Suno code
-- (Suno API 驗證會通過,sharer_handle 也對得上),但 p_suno_share_url 填
-- https://evil.example/s/<code> 這種釣魚網址,一樣能存進 DB、顯示給別人點擊。
-- Next.js 層(submit/actions.ts 的 parseSunoShareUrl())已經先擋掉這個問題,
-- 存進去的一律是 canonical 的 https://suno.com/s/<code>——這裡補第二層防護,
-- 直接在 DB 端也驗證格式,不只信任呼叫端有沒有乖乖用 Next.js。

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
  if p_suno_share_url !~ '^https://suno\.com/s/[A-Za-z0-9]+$' then
    raise exception 'suno_share_url must be a canonical https://suno.com/s/<code> link';
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
