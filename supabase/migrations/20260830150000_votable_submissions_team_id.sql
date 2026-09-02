-- get_votable_submissions() 補回傳 team_id——team 賽事的 matches.registration_a_id/
-- b_id 是 null,/vote 頁面沒辦法用 registration_id 把投稿對應到 team_a_id/team_b_id
-- 哪一邊,需要直接拿到 team_id 才能對應。回傳型別改變,create or replace 會被拒絕,
-- 要先 drop。
drop function get_votable_submissions(uuid);

create function get_votable_submissions(p_round_id uuid)
returns table (id uuid, title text, registration_id uuid, user_id uuid, suno_share_url text, team_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_is_public boolean;
  v_voting_opens_at timestamptz;
  v_voting_closes_at timestamptz;
begin
  select c.is_public, r.voting_opens_at, r.voting_closes_at
    into v_is_public, v_voting_opens_at, v_voting_closes_at
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;

  if v_is_public is null or not v_is_public then
    return;
  end if;
  if v_voting_opens_at is null or now() < v_voting_opens_at or v_voting_closes_at is null or now() >= v_voting_closes_at then
    return;
  end if;

  return query
    select s.id, s.title, s.registration_id, r.user_id, s.suno_share_url, s.team_id
    from submissions s
    join registrations r on r.id = s.registration_id
    where s.round_id = p_round_id and s.status = 'approved'
      and (s.team_id is null or s.is_team_selected);
end;
$$;
-- drop function 連同它的權限一起刪掉,重新 create 的是全新物件,要重新 grant——
-- 不然 authenticated 呼叫這支 RPC 會突然變成 permission denied。
grant execute on function get_votable_submissions(uuid) to authenticated;
