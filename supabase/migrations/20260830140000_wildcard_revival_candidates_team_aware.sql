-- 外卡復活候選人的投稿內容:team 賽事下候選人所屬隊伍在 source_round 的正式
-- 送出投稿(不是候選人個人上傳的候選草稿——他上傳的那筆可能根本沒被隊長選中,
-- 甚至可能是隊友上傳、他自己完全沒上傳過任何候選版本)。用 stage 起始輪的
-- team_members 反查候選人屬於哪支隊伍,team 賽事查 team_id + is_team_selected,
-- 個人賽事維持原本查 registration_id 的邏輯。
create or replace function get_wildcard_revival_candidates(p_event_id uuid)
returns table (registration_id uuid, user_id uuid, submission_id uuid, title text, suno_share_url text)
language plpgsql security definer set search_path = public as $$
declare
  v_is_public boolean;
  v_source_round_id uuid;
  v_voting_opens_at timestamptz;
  v_voting_closes_at timestamptz;
  v_stage_start_round_id uuid;
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

  v_stage_start_round_id := get_team_stage_start_round_id(v_source_round_id);

  return query
    select wc.registration_id, r.user_id, s.id, s.title, s.suno_share_url
    from wildcard_revival_candidates wc
    join registrations r on r.id = wc.registration_id
    left join team_members tm on tm.round_id = v_stage_start_round_id and tm.registration_id = wc.registration_id
    left join submissions s on (
      (tm.team_id is not null and s.team_id = tm.team_id and s.round_id = v_source_round_id and s.status = 'approved' and s.is_team_selected)
      or (tm.team_id is null and s.registration_id = wc.registration_id and s.round_id = v_source_round_id and s.status = 'approved')
    )
    where wc.event_id = p_event_id;
end;
$$;
