-- Phase 4e:「隊伍賽真正支援對戰單位」上線,解除 20260829010000 加的
-- 「team + single_elimination/double_elimination/round_robin 互斥」擋——這次
-- 功能做的就是讓這個組合真正運作。round_robin 的「必須搭配 lottery」規則放寬成
-- 「必須搭配 lottery 或 team」(team round_robin 用隊伍數量本身已經夠小,略過
-- pool 分池,直接讓所有隊伍兩兩對戰,見 20260830100000)。其餘鎖定規則(已有真實
-- 賽程資料鎖定、periodic_accumulation 不能有獨立評分規則覆寫)不變。
create or replace function set_round_format_block(p_round_id uuid, p_category text, p_block_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_results_finalized_at timestamptz;
  v_block_id uuid;
  v_has_schedule_data boolean;
  v_current_grouping_key text;
  v_current_elimination_key text;
begin
  if p_category not in ('elimination', 'grouping') then
    raise exception 'set_round_format_block only handles elimination/grouping categories';
  end if;

  select competition_id, results_finalized_at into v_competition_id, v_results_finalized_at
  from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;

  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to edit this round''s format';
  end if;

  select id into v_block_id from format_blocks where key = p_block_key and category = p_category::format_block_category;
  if v_block_id is null then
    raise exception 'format block % not found in category %', p_block_key, p_category;
  end if;

  select
    exists (select 1 from teams where round_id = p_round_id)
    or exists (select 1 from pools where round_id = p_round_id)
    or exists (select 1 from matches where round_id = p_round_id)
  into v_has_schedule_data;

  if v_has_schedule_data or v_results_finalized_at is not null then
    raise exception 'this round already has real schedule data or finalized results — elimination/grouping cannot be changed';
  end if;

  select fb.key into v_current_grouping_key
  from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
  where rfb.round_id = p_round_id and fb.category = 'grouping';

  select fb.key into v_current_elimination_key
  from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
  where rfb.round_id = p_round_id and fb.category = 'elimination';

  if p_category = 'elimination' and p_block_key = 'round_robin'
     and coalesce(v_current_grouping_key, '') not in ('lottery', 'team') then
    raise exception 'round_robin requires lottery or team grouping to be selected first';
  end if;

  if p_category = 'grouping' and p_block_key not in ('lottery', 'team') and v_current_elimination_key = 'round_robin' then
    raise exception 'round_robin requires lottery or team grouping — switch elimination away from round_robin first';
  end if;

  if p_category = 'elimination' and p_block_key = 'periodic_accumulation'
     and exists (select 1 from scoring_rules where round_id = p_round_id) then
    raise exception 'this round already has an independent scoring rule override — remove it before switching to periodic_accumulation';
  end if;

  delete from round_format_blocks
  where round_id = p_round_id
    and format_block_id in (select id from format_blocks where category = p_category::format_block_category);

  insert into round_format_blocks (round_id, format_block_id) values (p_round_id, v_block_id);
end;
$$;
