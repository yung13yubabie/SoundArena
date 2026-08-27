-- 雙敗淘汰(double_elimination)——grilling 確認的設計:
-- - 沿用循環賽/單敗淘汰同一套 matches/match_votes 基礎設施。
-- - 每輪同時對「0敗組」(勝部)跟「1敗組」(敗部)分開隨機配對,兩組各自獨立處理
--   奇偶(人數是奇數時該組隨機抽一人自動輪空,不建立場次)。
-- - 敗場數不額外存欄位,即時查詢這場比賽底下所有 double_elimination 輪次的對戰
--   紀錄算出來——避免多一份可能跟真實紀錄兜不起來的重複狀態。
-- - matches 新增 bracket 欄位('winners' | 'losers'),不只是顯示用:0敗組輸的人
--   不淘汰(敗場數變1,下輪進敗部),1敗組輸的人是第二次輸,直接淘汰——這個分岔
--   要看場次屬於哪一組才能判斷,不是所有場次都同一套規則(這點跟單敗淘汰不同,
--   單敗淘汰是「每一場輸家都淘汰」)。
-- - 最終戰(勝部剩1人、敗部剩1人對決)不做傳統雙敗淘汰的「敗部水漲」重賽規則,
--   誰贏誰就是冠軍——簡化,使用者確認可接受。

alter table matches add column bracket text check (bracket in ('winners', 'losers', 'final'));

create or replace function generate_double_elimination_matches_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_round_index int;
  v_min_idx int;
  v_registration_closes_at timestamptz;
  v_is_double_elim boolean;
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

  -- 依「這場比賽底下所有 double_elimination 輪次的對戰紀錄」即時算出每個 active
  -- 報名者目前的敗場數,分成 0敗(勝部)/1敗(敗部)兩組——敗兩次的人已經在上一次
  -- finalize 時被標記 eliminated,不會出現在這裡(active 篩選會自然排除)。
  with loss_counts as (
    select reg.id as registration_id,
      (
        select count(*) from matches m
        join rounds mr on mr.id = m.round_id
        where mr.competition_id = v_competition_id
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

  -- 最終戰:勝部(0敗)剩1人、敗部(1敗)剩1人,兩組各自配對規則(同組才能配對)
  -- 在這裡會卡住(各組都不足2人配對),需要特別處理成跨組對決——這是唯一允許
  -- 勝部/敗部混打的例外。誰輸這場就出局,不做敗部水漲重賽(grilling 確認的簡化)。
  if v_zero_loss_ids is not null and array_length(v_zero_loss_ids, 1) = 1
     and v_one_loss_ids is not null and array_length(v_one_loss_ids, 1) = 1 then
    insert into matches (round_id, pool_id, registration_a_id, registration_b_id, bracket)
    values (p_round_id, null, v_zero_loss_ids[1], v_one_loss_ids[1], 'final');
    return;
  end if;

  -- 勝部(0敗)配對
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

  -- 敗部(1敗)配對
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
  -- 各組落單的人(奇數人數的最後一人)自動輪空:不建立場次,finalize 時不會被
  -- 觸及,下一輪重新計算敗場數時維持原本的敗場數不變,自然歸進對應的組別。
end;
$$;
grant execute on function generate_double_elimination_matches_for_round(uuid) to authenticated;

create or replace function check_and_form_pending_double_elimination_matches(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round_id uuid;
begin
  for v_round_id in select id from rounds where competition_id = p_competition_id order by round_index loop
    perform generate_double_elimination_matches_for_round(v_round_id);
  end loop;
end;
$$;
grant execute on function check_and_form_pending_double_elimination_matches(uuid) to authenticated;
