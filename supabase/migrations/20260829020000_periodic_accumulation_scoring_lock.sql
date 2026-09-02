-- Codex 第二輪對抗式審查 Finding 3(高)的修復。月/週期累積制的排名不是只看單輪
-- 分數,是看整個累積賽段所有週期分數的總和——mergeJudgeScoringData()(lib/
-- judgeScoring.ts)拿賽段裡「第一輪」的 scoreItems 當整個賽段的欄位定義去合併
-- 加總。UI 原本允許賽段內任一輪(含第一輪自己)獨立開啟評分規則覆寫,一旦某輪
-- 的計分項目 id 跟其他輪不同,那一輪的分數在合併時就會直接對不上欄位、被靜默
-- 漏算——不是顯示錯誤而已,直接影響自動淘汰名單跟外卡復活候選排序算出錯的人。
-- 程式本身已經有註解點出這個假設「要求這個賽段裡的輪次共用同一份計分規則」,
-- 但從來沒有資料庫或 UI 層的實際約束,這裡補上。
--
-- 雙向擋:這一輪已經是 periodic_accumulation 時不能再開獨立評分規則覆寫;
-- 已經有獨立評分規則覆寫的輪次不能切成 periodic_accumulation(這條在
-- set_round_format_block() 裡,20260829010000 已經補上)。

create or replace function check_scoring_rule_override_periodic_accumulation()
returns trigger language plpgsql as $$
declare
  v_is_periodic boolean;
begin
  if new.round_id is null then
    return new;
  end if;

  select exists (
    select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
    where rfb.round_id = new.round_id and fb.key = 'periodic_accumulation'
  ) into v_is_periodic;

  if v_is_periodic then
    raise exception 'periodic_accumulation rounds cannot use an independent scoring rule override — the cumulative merge logic requires every round in the stage to share the same rule';
  end if;

  return new;
end;
$$;

create trigger scoring_rules_check_periodic_override
  before insert on scoring_rules
  for each row execute function check_scoring_rule_override_periodic_accumulation();
