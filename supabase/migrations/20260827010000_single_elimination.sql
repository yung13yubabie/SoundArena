-- 單敗淘汰(single_elimination)——grilling 確認的設計:
-- - 只有個人對戰,不跟隊伍分組互動;沿用循環賽剛做的 matches/match_votes 配對投票
--   基礎設施,不重新蓋一套。
-- - 跟循環賽不同:單敗淘汰不需要「分池」概念(場次數量本來就隨每輪淘汰自然減半,
--   不像循環賽需要用分池控制 C(n,2) 場次爆炸)——matches.pool_id 原本是 not null,
--   這裡放寬成可以是 null。
-- - 第一輪報名截止(或前一輪確認結果)後,把還在比賽中的人隨機兩兩配對,人數是
--   奇數時隨機抽中一人自動輪空晉級(不建立場次,不特別處理——沒有場次牽涉到的人,
--   finalize 時自然不會被標記淘汰,等於自動晉級)。
-- - 每輪都重新隨機配對(不保留固定賽事樹位置),允許同一組對手在不同輪次再碰到。
-- - 排名/淘汰邏輯不套用 elimination_percent(那是%自動淘汰,單敗淘汰是「輸家
--   100%出局」,兩套機制不疊加)——這部分留給 Next.js 端的 finalizeRoundResults()
--   處理(平手時要能整個拒絕確認、不能亂猜贏家),這裡只負責配對本身。

alter table matches alter column pool_id drop not null;

create or replace function generate_single_elimination_matches_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_round_index int;
  v_min_idx int;
  v_registration_closes_at timestamptz;
  v_is_single_elim boolean;
  v_prev_round_id uuid;
  v_prev_finalized_at timestamptz;
  v_trigger_met boolean := false;
  v_reg_ids uuid[];
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

  select array_agg(id) into v_reg_ids from registrations where competition_id = v_competition_id and status = 'active';
  if v_reg_ids is null or array_length(v_reg_ids, 1) < 2 then return; end if;

  select array_agg(x) into v_shuffled from (select unnest(v_reg_ids) as x order by random()) t;
  v_total := array_length(v_shuffled, 1);

  v_i := 1;
  while v_i + 1 <= v_total loop
    insert into matches (round_id, pool_id, registration_a_id, registration_b_id)
    values (p_round_id, null, v_shuffled[v_i], v_shuffled[v_i + 1]);
    v_i := v_i + 2;
  end loop;
  -- v_i > v_total 表示人數是偶數,配完了;v_i = v_total 表示還剩最後一人配不到對手,
  -- 那個人自動輪空(不建立場次,什麼都不用做,finalize 時不會被標記淘汰)。
end;
$$;
grant execute on function generate_single_elimination_matches_for_round(uuid) to authenticated;

create or replace function check_and_form_pending_single_elimination_matches(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round_id uuid;
begin
  for v_round_id in select id from rounds where competition_id = p_competition_id order by round_index loop
    perform generate_single_elimination_matches_for_round(v_round_id);
  end loop;
end;
$$;
grant execute on function check_and_form_pending_single_elimination_matches(uuid) to authenticated;
