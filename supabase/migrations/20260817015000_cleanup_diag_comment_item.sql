-- 收尾:上一個 migration 是臨時測試 function,用完即丟。把測試時加進「深夜擂台 EP.04」
-- 預設 ScoringRule 的「留言認可加分」項目也一併移除、外部投票權重復原成 35%——
-- 這是測試治具本身造成的異動,不是真的 Organizer 透過 UI 決定啟用,留著只會讓下次
-- 打開 /admin/format 的人看到一個沒有對應 UI 可以解釋的神秘項目。
-- comments 表裡實際的留言+認可資料維持不變,那是功能本身的展示資料,不是測試治具。

do $$
declare
  v_scoring_rule_id uuid := '7634c565-fa06-4259-a29a-a4e5d253074c';
begin
  delete from score_items where scoring_rule_id = v_scoring_rule_id and label = '留言認可加分';
  update score_items set weight_percent = 35.00
  where scoring_rule_id = v_scoring_rule_id and label = '外部投票';
end $$;

drop function if exists diag_add_comment_item_temp();
