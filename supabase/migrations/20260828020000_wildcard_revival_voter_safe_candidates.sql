-- 延續 20260828010000 的 Finding 2 修法,補上 /vote/wildcard 頁面自己需要的版本:
-- wildcard_revival_candidates 內嵌的 registrations(user_id, display_name) 對一般
-- 投票者來說一樣會被 RLS 擋下(registrations 只放行 self/主辦人讀),沒辦法直接沿用
-- get_votable_submissions()——那支是綁「source_round 自己的投票視窗」,但外卡復活
-- 投票開放時,來源輪次的投票早就截止了,綁錯視窗會整個回傳空集合。這裡另外寫一支
-- 綁「這個外卡復活事件自己的投票視窗」的安全讀取 RPC。
create or replace function get_wildcard_revival_candidates(p_event_id uuid)
returns table (registration_id uuid, user_id uuid, submission_id uuid, title text, suno_share_url text)
language plpgsql security definer set search_path = public as $$
declare
  v_is_public boolean;
  v_source_round_id uuid;
  v_voting_opens_at timestamptz;
  v_voting_closes_at timestamptz;
begin
  select c.is_public, e.source_round_id, e.voting_opens_at, e.voting_closes_at
    into v_is_public, v_source_round_id, v_voting_opens_at, v_voting_closes_at
  from wildcard_revival_events e join competitions c on c.id = e.competition_id
  where e.id = p_event_id;

  if v_is_public is null or not v_is_public then
    return;
  end if;
  if v_voting_opens_at is null or now() < v_voting_opens_at or v_voting_closes_at is null or now() >= v_voting_closes_at then
    return;
  end if;

  return query
    select wc.registration_id, r.user_id, s.id, s.title, s.suno_share_url
    from wildcard_revival_candidates wc
    join registrations r on r.id = wc.registration_id
    left join submissions s on s.registration_id = wc.registration_id and s.round_id = v_source_round_id and s.status = 'approved'
    where wc.event_id = p_event_id;
end;
$$;
grant execute on function get_wildcard_revival_candidates(uuid) to authenticated;
