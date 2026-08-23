-- 前一個 migration(20260823060000)移除 video_traffic 範本後,忘記這支
-- create_competition_full() 裡也寫死引用同一個 key——v_video_template_id 現在會
-- 查到 null,INSERT 不會報錯(template_id 是 nullable FK),但每個新建立的比賽都會
-- 多一個「影片流量」的孤兒計分項目(template_id=null,get_round_scores() 永遠落在
-- else 分支,行為又變回死選項)。跟 web/src/app/admin/format/actions.ts 的
-- DEFAULT_SCORE_ITEMS 同一批修正,拿掉 video_traffic、把權重併進 external_vote。
create or replace function create_competition_full(p_name text, p_slug text, p_default_anonymous boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_competition_id uuid;
  v_scoring_rule_id uuid;
  v_vote_template_id uuid;
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
  select id into v_external_template_id from score_item_templates where key = 'external_vote';

  insert into score_items (scoring_rule_id, template_id, label, kind, weight_percent, sort_order) values
    (v_scoring_rule_id, v_vote_template_id, '投票', 'weighted', 40, 0),
    (v_scoring_rule_id, v_external_template_id, '外部投票', 'weighted', 60, 1);

  return v_competition_id;
end;
$$;
grant execute on function create_competition_full(text, text, boolean) to authenticated;
