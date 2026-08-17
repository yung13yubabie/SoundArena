-- 臨時測試用:把 comment_endorsement 加進「深夜擂台 EP.04」的預設 ScoringRule 驗證
-- get_round_scores 真的會算——insert 新項目 + 調整既有權重要在同一個交易內完成,
-- 不然 deferred 的 100% 權重總和檢查會在單一 REST 呼叫的隱含交易結尾就先炸掉。
-- 下一個 migration 會把這個 function 砍掉,不是永久 schema。
create or replace function diag_add_comment_item_temp()
returns void language plpgsql as $$
declare
  v_scoring_rule_id uuid := '7634c565-fa06-4259-a29a-a4e5d253074c';
  v_template_id uuid;
begin
  select id into v_template_id from score_item_templates where key = 'comment_endorsement';

  update score_items set weight_percent = 30.00
  where scoring_rule_id = v_scoring_rule_id and label = '外部投票';

  insert into score_items (scoring_rule_id, template_id, label, kind, weight_percent, sort_order)
  values (v_scoring_rule_id, v_template_id, '留言認可加分', 'weighted', 5.00, 3);
end;
$$;
