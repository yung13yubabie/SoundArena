-- Phase 7:「隊伍賽真正支援對戰單位」——評審評分/投票列表這兩支既有 RPC 原本
-- 完全不知道 team 候選投稿(is_team_selected)這個概念,team 賽事下一隊如果有
-- 好幾筆候選版本都審核通過,評審/投票者會看到好幾筆看似獨立的投稿——不只是
-- 顯示混亂,分數/排名計算會被沒被隊長選中的候選草稿污染。兩支 RPC 都補上
-- 「team_id is null(個人賽事)或 is_team_selected=true(team賽事只留正式送出的
-- 那一筆)」的過濾。

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
    where s.round_id = p_round_id and s.status = 'approved'
      and (s.team_id is null or s.is_team_selected);
end;
$$;
grant execute on function judge_submissions_for_round(uuid) to authenticated;

create or replace function get_votable_submissions(p_round_id uuid)
returns table (id uuid, title text, registration_id uuid, user_id uuid, suno_share_url text)
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
    select s.id, s.title, s.registration_id, r.user_id, s.suno_share_url
    from submissions s
    join registrations r on r.id = s.registration_id
    where s.round_id = p_round_id and s.status = 'approved'
      and (s.team_id is null or s.is_team_selected);
end;
$$;
