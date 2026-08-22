-- SA-008 修復:createCompetition() 原本依序做 4 個獨立呼叫(insert competition、
-- RPC create_initial_rounds、insert scoring_rule、insert score items),中途任一步
-- 失敗,前面已成功的部分不會自動 rollback,可能留下「有比賽沒輪次」「有比賽有輪次
-- 沒計分規則」這種結構不完整的殘留。修法是把整套「建立一場比賽」收進單一 RPC,
-- 一次 RPC 呼叫就是一個 Postgres transaction,任何一步 raise exception 全部 rollback。
--
-- slug 產生邏輯(unicode 感知的 slugify + 隨機後綴)刻意留在 TypeScript 端算好再傳
-- 進來,不在 SQL 裡重寫一份正規表達式版本——這不是原子性關心的部分,沒必要冒著
-- 行為跟舊版不一致的風險重寫。
--
-- create_initial_rounds() 沿用既有的(不重寫一份 rounds insert 邏輯),因為呼叫當下
-- competitions 這筆已經在同一個 transaction 內建立好、organizer_id 已經是自己,
-- can_manage_competition() 內部的 is_competition_organizer() 查詢看得到這筆(同一個
-- transaction 內的未提交變更對後續同 transaction 的查詢可見,這是 Postgres 標準行為)。

create or replace function create_competition_full(p_name text, p_slug text, p_default_anonymous boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_competition_id uuid;
  v_scoring_rule_id uuid;
  v_vote_template_id uuid;
  v_video_template_id uuid;
  v_external_template_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not is_non_revoked_self() then
    raise exception 'insufficient permission to create a competition';
  end if;
  if trim(p_name) = '' then
    raise exception 'name cannot be empty';
  end if;
  if length(p_slug) = 0 then
    raise exception 'slug cannot be empty';
  end if;

  insert into competitions (organizer_id, name, slug, is_public)
  values (v_user_id, trim(p_name), p_slug, true)
  returning id into v_competition_id;

  perform create_initial_rounds(v_competition_id, p_default_anonymous);

  insert into scoring_rules (competition_id, round_id) values (v_competition_id, null)
  returning id into v_scoring_rule_id;

  select id into v_vote_template_id from score_item_templates where key = 'vote';
  select id into v_video_template_id from score_item_templates where key = 'video_traffic';
  select id into v_external_template_id from score_item_templates where key = 'external_vote';

  insert into score_items (scoring_rule_id, template_id, label, kind, weight_percent, sort_order) values
    (v_scoring_rule_id, v_vote_template_id, '投票', 'weighted', 40, 0),
    (v_scoring_rule_id, v_video_template_id, '影片流量', 'weighted', 25, 1),
    (v_scoring_rule_id, v_external_template_id, '外部投票', 'weighted', 35, 2);

  return v_competition_id;
end;
$$;
grant execute on function create_competition_full(text, text, boolean) to authenticated;
