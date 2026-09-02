-- Phase 4f:循環賽的 team-aware 配對。team 模式跳過 pool 分池——隊伍數量本身
-- 已經被組隊時的「分幾組(上限5)」限制夠小,不需要再用 lottery pool_size 二次
-- 分池控制 C(n,2) 爆炸,直接讓 stage 起始輪還在賽事中的所有隊伍兩兩對戰一次。
create or replace function generate_round_robin_matches_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_is_round_robin boolean;
  v_is_team_round boolean;
  v_stage_start_round_id uuid;
  v_team_ids uuid[];
  v_pool record;
  v_members uuid[];
  v_a int;
  v_b int;
begin
  if exists (select 1 from matches where round_id = p_round_id) then return; end if;

  select exists (
    select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
    where rfb.round_id = p_round_id and fb.key = 'round_robin'
  ) into v_is_round_robin;
  if not v_is_round_robin then return; end if;

  select exists (
    select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
    where rfb.round_id = p_round_id and fb.key = 'team'
  ) into v_is_team_round;

  if v_is_team_round then
    v_stage_start_round_id := get_team_stage_start_round_id(p_round_id);
    select array_agg(distinct t.id order by t.id) into v_team_ids
    from teams t
    join team_members tm on tm.team_id = t.id
    join registrations r on r.id = tm.registration_id
    where t.round_id = v_stage_start_round_id and r.status = 'active';
    if v_team_ids is null or array_length(v_team_ids, 1) < 2 then return; end if;

    for v_a in 1..array_length(v_team_ids, 1) loop
      for v_b in (v_a + 1)..array_length(v_team_ids, 1) loop
        insert into matches (round_id, pool_id, team_a_id, team_b_id)
        values (p_round_id, null, v_team_ids[v_a], v_team_ids[v_b]);
      end loop;
    end loop;
    return;
  end if;

  -- 個人賽事:完全維持原邏輯不變。
  for v_pool in select id from pools where round_id = p_round_id loop
    select array_agg(registration_id order by registration_id) into v_members from pool_members where pool_id = v_pool.id;
    if v_members is null or array_length(v_members, 1) < 2 then continue; end if;

    for v_a in 1..array_length(v_members, 1) loop
      for v_b in (v_a + 1)..array_length(v_members, 1) loop
        insert into matches (round_id, pool_id, registration_a_id, registration_b_id)
        values (p_round_id, v_pool.id, v_members[v_a], v_members[v_b]);
      end loop;
    end loop;
  end loop;
end;
$$;
