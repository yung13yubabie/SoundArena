-- Phase 4d:雙敗淘汰的 team-aware 配對。跟單敗淘汰同一套 team-aware 分支模式,
-- 敗場數改成以 team 為單位查 winner_team_id(不是 winner_registration_id)。
-- 「還在賽事中」用 team 內任一成員(整隊一起淘汰,成員狀態一致)還是 active 判斷。
create or replace function generate_double_elimination_matches_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_round_index int;
  v_min_idx int;
  v_registration_closes_at timestamptz;
  v_is_double_elim boolean;
  v_is_team_round boolean;
  v_stage_start_round_id uuid;
  v_prev_round_id uuid;
  v_prev_finalized_at timestamptz;
  v_trigger_met boolean := false;
  v_zero_loss_ids uuid[];
  v_one_loss_ids uuid[];
  v_shuffled uuid[];
  v_total int;
  v_i int;
begin
  select r.competition_id, r.round_index, c.registration_closes_at
    into v_competition_id, v_round_index, v_registration_closes_at
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;
  if v_competition_id is null then return; end if;

  if exists (select 1 from matches where round_id = p_round_id) then return; end if;

  select exists (
    select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
    where rfb.round_id = p_round_id and fb.key = 'double_elimination'
  ) into v_is_double_elim;
  if not v_is_double_elim then return; end if;

  select exists (
    select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
    where rfb.round_id = p_round_id and fb.key = 'team'
  ) into v_is_team_round;

  select min(round_index) into v_min_idx from rounds where competition_id = v_competition_id;

  if v_round_index = v_min_idx then
    v_trigger_met := v_registration_closes_at is not null and now() >= v_registration_closes_at;
  else
    select id into v_prev_round_id from rounds
    where competition_id = v_competition_id and round_index < v_round_index
    order by round_index desc limit 1;
    if v_prev_round_id is not null then
      select results_finalized_at into v_prev_finalized_at from rounds where id = v_prev_round_id;
      v_trigger_met := v_prev_finalized_at is not null;
    end if;
  end if;
  if not v_trigger_met then return; end if;

  if v_is_team_round then
    v_stage_start_round_id := get_team_stage_start_round_id(p_round_id);

    with loss_counts as (
      select t.id as team_id,
        (
          select count(*) from matches m
          join rounds mr on mr.id = m.round_id
          where mr.competition_id = v_competition_id
            and exists (
              select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
              where rfb.round_id = mr.id and fb.key = 'double_elimination'
            )
            and m.winner_team_id is not null
            and (m.team_a_id = t.id or m.team_b_id = t.id)
            and m.winner_team_id <> t.id
        ) as losses
      from teams t
      where t.round_id = v_stage_start_round_id
        and exists (
          select 1 from team_members tm join registrations r on r.id = tm.registration_id
          where tm.team_id = t.id and r.status = 'active'
        )
    )
    select
      array_agg(team_id) filter (where losses = 0),
      array_agg(team_id) filter (where losses = 1)
    into v_zero_loss_ids, v_one_loss_ids
    from loss_counts;

    if v_zero_loss_ids is not null and array_length(v_zero_loss_ids, 1) = 1
       and v_one_loss_ids is not null and array_length(v_one_loss_ids, 1) = 1 then
      insert into matches (round_id, pool_id, team_a_id, team_b_id, bracket)
      values (p_round_id, null, v_zero_loss_ids[1], v_one_loss_ids[1], 'final');
      return;
    end if;

    if v_zero_loss_ids is not null and array_length(v_zero_loss_ids, 1) >= 2 then
      select array_agg(x) into v_shuffled from (select unnest(v_zero_loss_ids) as x order by random()) t;
      v_total := array_length(v_shuffled, 1);
      v_i := 1;
      while v_i + 1 <= v_total loop
        insert into matches (round_id, pool_id, team_a_id, team_b_id, bracket)
        values (p_round_id, null, v_shuffled[v_i], v_shuffled[v_i + 1], 'winners');
        v_i := v_i + 2;
      end loop;
    end if;

    if v_one_loss_ids is not null and array_length(v_one_loss_ids, 1) >= 2 then
      select array_agg(x) into v_shuffled from (select unnest(v_one_loss_ids) as x order by random()) t;
      v_total := array_length(v_shuffled, 1);
      v_i := 1;
      while v_i + 1 <= v_total loop
        insert into matches (round_id, pool_id, team_a_id, team_b_id, bracket)
        values (p_round_id, null, v_shuffled[v_i], v_shuffled[v_i + 1], 'losers');
        v_i := v_i + 2;
      end loop;
    end if;
    return;
  end if;

  -- 個人賽事:完全維持原邏輯不變。
  with loss_counts as (
    select reg.id as registration_id,
      (
        select count(*) from matches m
        join rounds mr on mr.id = m.round_id
        where mr.competition_id = v_competition_id
          and exists (
            select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
            where rfb.round_id = mr.id and fb.key = 'double_elimination'
          )
          and m.winner_registration_id is not null
          and (m.registration_a_id = reg.id or m.registration_b_id = reg.id)
          and m.winner_registration_id <> reg.id
      ) as losses
    from registrations reg
    where reg.competition_id = v_competition_id and reg.status = 'active'
  )
  select
    array_agg(registration_id) filter (where losses = 0),
    array_agg(registration_id) filter (where losses = 1)
  into v_zero_loss_ids, v_one_loss_ids
  from loss_counts;

  if v_zero_loss_ids is not null and array_length(v_zero_loss_ids, 1) = 1
     and v_one_loss_ids is not null and array_length(v_one_loss_ids, 1) = 1 then
    insert into matches (round_id, pool_id, registration_a_id, registration_b_id, bracket)
    values (p_round_id, null, v_zero_loss_ids[1], v_one_loss_ids[1], 'final');
    return;
  end if;

  if v_zero_loss_ids is not null and array_length(v_zero_loss_ids, 1) >= 2 then
    select array_agg(x) into v_shuffled from (select unnest(v_zero_loss_ids) as x order by random()) t;
    v_total := array_length(v_shuffled, 1);
    v_i := 1;
    while v_i + 1 <= v_total loop
      insert into matches (round_id, pool_id, registration_a_id, registration_b_id, bracket)
      values (p_round_id, null, v_shuffled[v_i], v_shuffled[v_i + 1], 'winners');
      v_i := v_i + 2;
    end loop;
  end if;

  if v_one_loss_ids is not null and array_length(v_one_loss_ids, 1) >= 2 then
    select array_agg(x) into v_shuffled from (select unnest(v_one_loss_ids) as x order by random()) t;
    v_total := array_length(v_shuffled, 1);
    v_i := 1;
    while v_i + 1 <= v_total loop
      insert into matches (round_id, pool_id, registration_a_id, registration_b_id, bracket)
      values (p_round_id, null, v_shuffled[v_i], v_shuffled[v_i + 1], 'losers');
      v_i := v_i + 2;
    end loop;
  end if;
end;
$$;
