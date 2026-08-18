-- ScoreEditor(admin/format)一直只能編輯/移除已存在的計分項目——replace_score_items
-- (20260816095858)只做 UPDATE + DELETE,從來沒有 INSERT 分支。結果是 score_item_templates
-- 範本庫裡的 comment_endorsement(留言認可加分,08-17 那輪就建好)完全沒有介面能加進任何
-- 比賽的 ScoringRule——留言/認可功能做完了,但這個計分項目沒有 UI 路徑能被啟用,一直停在
-- HANDOFF 記錄的已知缺口。RLS 早就允許 INSERT(score_items writable by organizer or
-- collaborator 是 for all policy),只是沒有程式碼路徑呼叫過。

create or replace function add_score_item_from_template(p_scoring_rule_id uuid, p_template_key text)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_template_id uuid;
  v_label text;
  v_kind score_item_kind;
  v_next_sort int;
  v_new_id uuid;
begin
  select id, label, default_kind into v_template_id, v_label, v_kind
  from score_item_templates where key = p_template_key;

  if v_template_id is null then
    raise exception 'unknown score item template: %', p_template_key;
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_next_sort
  from score_items where scoring_rule_id = p_scoring_rule_id;

  insert into score_items (scoring_rule_id, template_id, label, kind, weight_percent, sort_order)
  values (
    p_scoring_rule_id,
    v_template_id,
    v_label,
    v_kind,
    case when v_kind = 'weighted' then 0 else null end,
    v_next_sort
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function add_score_item_from_template(uuid, text) to authenticated;
