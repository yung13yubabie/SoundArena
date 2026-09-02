-- Codex 第二輪對抗式審查 Finding 1/2/4 的修復。原本 toggleFormatBlock()(Next.js
-- Server Action)對 elimination/grouping 類別是直接對 round_format_blocks 表做
-- 「先刪同分類舊的、再插入新的」兩次獨立的 PostgREST 呼叫,完全沒有驗證:
--
-- Finding 1(高):已經產生 teams/pools/matches 或已確認結果的輪次,還是可以任意
-- 切換 elimination/grouping,導致既有賽程資料按新規則被誤判(例如已產生單敗淘汰
-- 場次後切成雙敗淘汰,舊場次沒有 bracket 欄位,雙敗淘汰的結算邏輯會判斷成沒人該
-- 淘汰)。這個限制必須在資料庫層實施,不能只靠 UI——這裡改成一支 security definer
-- RPC,用單一交易做「驗證 + 刪除 + 插入」,避免 Server Action 兩次獨立呼叫之間
-- 可能出現的中間態(刪除成功但插入被擋下,輪次暫時沒有選任何積木)。
--
-- Finding 2(高):UI 允許同時選「隊伍賽」分組跟「單敗淘汰/雙敗淘汰/循環賽」淘汰
-- 方式,但這三種淘汰方式的配對邏輯全部是直接對 registrations(個人報名)配對,
-- 完全不知道「隊伍」這個聚合單位存在——組好的隊伍資訊被晾在一邊,純裝飾。在真正
-- 支援隊伍對戰單位之前,禁止這個組合。
--
-- Finding 4(中):UI 允許只選「循環賽」不選「抽籤分組」,generate_round_robin_
-- matches_for_round() 只看 pools 表有沒有資料,沒有 pools 就靜默跑完迴圈零次,
-- 一場都不會產生,沒有任何錯誤訊息。循環賽本來就是靠抽籤分組的 pool_size 設定
-- 控制單輪內 C(n,2) 場次爆炸(見 ADR-0048),兩者從設計上就是綁定的一對——這裡
-- 要求選循環賽時 grouping 必須已經是 lottery,反過來也不能在循環賽仍然選用時
-- 把 grouping 切離 lottery。只要「先選抽籤分組、再選循環賽」這個順序永遠走得通,
-- 不會造成使用者被雙向規則卡死。

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

  if p_category = 'elimination' and p_block_key in ('single_elimination', 'double_elimination', 'round_robin')
     and v_current_grouping_key = 'team' then
    raise exception 'team grouping is not compatible with % elimination yet — pairing does not treat teams as a unit', p_block_key;
  end if;

  if p_category = 'grouping' and p_block_key = 'team'
     and v_current_elimination_key in ('single_elimination', 'double_elimination', 'round_robin') then
    raise exception 'team grouping is not compatible with % elimination yet — pairing does not treat teams as a unit', v_current_elimination_key;
  end if;

  if p_category = 'elimination' and p_block_key = 'round_robin' and coalesce(v_current_grouping_key, '') <> 'lottery' then
    raise exception 'round_robin requires lottery grouping to be selected first';
  end if;

  if p_category = 'grouping' and p_block_key <> 'lottery' and v_current_elimination_key = 'round_robin' then
    raise exception 'round_robin requires lottery grouping — switch elimination away from round_robin first';
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
grant execute on function set_round_format_block(uuid, text, text) to authenticated;
