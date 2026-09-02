-- Phase 6:外卡復活候選單位是個人(不是整隊,grilling 確認),復活後脫隊繼續打——
-- 如果來源輪次是 team + 對戰配對賽制/月週期累積制(跨輪次固定的 persistent 模式),
-- 系統自動挑人數最少的現存隊伍插入。一般%淘汰底下的隊伍賽(每輪重新分組)不需要
-- 這個插入邏輯,下一次分組時間點會自然把復活的人納入。
create or replace function resolve_wildcard_revival_event(p_event_id uuid, p_winner_registration_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_source_round_id uuid;
  v_voting_closes_at timestamptz;
  v_resolved_at timestamptz;
  v_is_candidate boolean;
  v_computed_winner uuid;
  v_max_votes int;
  v_top_count int;
  v_is_persistent_team_round boolean;
  v_stage_start_round_id uuid;
  v_smallest_team_id uuid;
begin
  select competition_id, source_round_id, voting_closes_at, resolved_at
    into v_competition_id, v_source_round_id, v_voting_closes_at, v_resolved_at
  from wildcard_revival_events where id = p_event_id;
  if v_competition_id is null then
    raise exception 'wildcard revival event not found';
  end if;

  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to resolve this wildcard revival event';
  end if;

  if v_resolved_at is not null then
    raise exception 'this wildcard revival event has already been resolved';
  end if;
  if now() < v_voting_closes_at then
    raise exception 'cannot resolve before voting has closed';
  end if;

  select exists (
    select 1 from wildcard_revival_candidates where event_id = p_event_id and registration_id = p_winner_registration_id
  ) into v_is_candidate;
  if not v_is_candidate then
    raise exception 'winner is not a candidate of this event';
  end if;

  with vote_counts as (
    select c.registration_id, count(v.id) as votes
    from wildcard_revival_candidates c
    left join wildcard_revival_votes v on v.event_id = c.event_id and v.chosen_registration_id = c.registration_id
    where c.event_id = p_event_id
    group by c.registration_id
  )
  select
    (select max(votes) from vote_counts),
    (select count(*) from vote_counts where votes = (select max(votes) from vote_counts)),
    (select registration_id from vote_counts where votes = (select max(votes) from vote_counts) limit 1)
  into v_max_votes, v_top_count, v_computed_winner;

  if v_top_count > 1 then
    raise exception 'tie for highest votes, cannot resolve automatically';
  end if;

  if v_computed_winner is distinct from p_winner_registration_id then
    raise exception 'supplied winner does not match the candidate with the most votes';
  end if;

  update wildcard_revival_events set winner_registration_id = p_winner_registration_id, resolved_at = now() where id = p_event_id;
  update registrations set status = 'active', eliminated_in_round_id = null where id = p_winner_registration_id;

  select
    exists (
      select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
      where rfb.round_id = v_source_round_id and fb.key = 'team'
    )
    and exists (
      select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
      where rfb.round_id = v_source_round_id and fb.key in ('single_elimination', 'double_elimination', 'round_robin', 'periodic_accumulation')
    )
  into v_is_persistent_team_round;

  if v_is_persistent_team_round then
    v_stage_start_round_id := get_team_stage_start_round_id(v_source_round_id);

    select t.id into v_smallest_team_id
    from teams t
    where t.round_id = v_stage_start_round_id
      and exists (
        select 1 from team_members tm join registrations r on r.id = tm.registration_id
        where tm.team_id = t.id and r.status = 'active'
      )
    order by (select count(*) from team_members tm2 where tm2.team_id = t.id) asc, random()
    limit 1;

    if v_smallest_team_id is not null then
      -- 外卡候選人本來就是這個 stage 裡某支(已淘汰)隊伍的成員,team_members
      -- 已經有 (round_id, registration_id) 這筆記錄——用 upsert 把他移到新隊伍,
      -- 不能直接 insert(會撞 unique(round_id, registration_id))。
      insert into team_members (team_id, round_id, registration_id)
      values (v_smallest_team_id, v_stage_start_round_id, p_winner_registration_id)
      on conflict (round_id, registration_id) do update set team_id = excluded.team_id;
    end if;
  end if;
end;
$$;
