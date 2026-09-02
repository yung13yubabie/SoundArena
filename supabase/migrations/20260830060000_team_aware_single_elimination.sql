-- Phase 4b:單敗淘汰的 team-aware 配對。team 賽事下配對的原子單位改成
-- team(用 get_team_stage_start_round_id() 找到 stage 起始輪,抓那一輪還在
-- 賽事中的 teams——「還在賽事中」用 team 內任一成員(整隊一起淘汰,成員狀態
-- 一致)還是 active 判斷),插入 matches 時 team_a_id/team_b_id 填隊伍 id,
-- registration_a_id/registration_b_id 維持 null(這一輪的官方投稿在配對當下
-- 還不存在,查詢改用 team_a_id/team_b_id + 這一輪的 submissions.is_team_selected,
-- 見 Phase 4a 的說明)。個人賽事(非 team grouping)完全維持原邏輯不變。
create or replace function generate_single_elimination_matches_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_round_index int;
  v_min_idx int;
  v_registration_closes_at timestamptz;
  v_is_single_elim boolean;
  v_is_team_round boolean;
  v_stage_start_round_id uuid;
  v_prev_round_id uuid;
  v_prev_finalized_at timestamptz;
  v_trigger_met boolean := false;
  v_ids uuid[];
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
    where rfb.round_id = p_round_id and fb.key = 'single_elimination'
  ) into v_is_single_elim;
  if not v_is_single_elim then return; end if;

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
    select array_agg(distinct t.id) into v_ids
    from teams t
    join team_members tm on tm.team_id = t.id
    join registrations r on r.id = tm.registration_id
    where t.round_id = v_stage_start_round_id and r.status = 'active';
    if v_ids is null or array_length(v_ids, 1) < 2 then return; end if;

    select array_agg(x) into v_shuffled from (select unnest(v_ids) as x order by random()) t;
    v_total := array_length(v_shuffled, 1);
    v_i := 1;
    while v_i + 1 <= v_total loop
      insert into matches (round_id, pool_id, team_a_id, team_b_id)
      values (p_round_id, null, v_shuffled[v_i], v_shuffled[v_i + 1]);
      v_i := v_i + 2;
    end loop;
  else
    select array_agg(id) into v_ids from registrations where competition_id = v_competition_id and status = 'active';
    if v_ids is null or array_length(v_ids, 1) < 2 then return; end if;

    select array_agg(x) into v_shuffled from (select unnest(v_ids) as x order by random()) t;
    v_total := array_length(v_shuffled, 1);
    v_i := 1;
    while v_i + 1 <= v_total loop
      insert into matches (round_id, pool_id, registration_a_id, registration_b_id)
      values (p_round_id, null, v_shuffled[v_i], v_shuffled[v_i + 1]);
      v_i := v_i + 2;
    end loop;
  end if;
  -- v_i > v_total 表示人數/隊數是偶數,配完了;v_i = v_total 表示還剩最後一個
  -- 配不到對手,自動輪空(不建立場次,finalize 時不會被標記淘汰)。
end;
$$;
