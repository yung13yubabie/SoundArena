-- SA-007 修復:saveScore()(judge/actions.ts)原本直接 client-side upsert
-- submission_scores,RLS 的「organizer or collaborator manageable」policy 只檢查
-- 「這個 submission 所屬的比賽你有沒有 judge 權限」,沒檢查「這個 score_item_id
-- 是否真的屬於這個 submission 適用的 scoring_rule」——持有合法 judge 權限的人可以
-- 把別的比賽/別的 scoring_rule 底下的 score_item_id 塞給任何自己能評的 submission,
-- 污染計分資料完整性(不是跨租戶讀寫漏洞,是同租戶內的資料完整性漏洞)。
--
-- 修法沿用 registrations/votes/comments 已經在用的「REVOKE 直接寫入 + SECURITY
-- DEFINER RPC 驗證後才能寫」手法:table-level 的 INSERT/UPDATE/DELETE 全面收回,
-- 只留 SELECT(judge/organizer 讀取既有分數還是要用 RLS),寫入一律走這支 RPC,
-- 裡面明確驗證 score_item 的 scoring_rule_id 真的等於這個 submission 所屬 round
-- (或比賽預設)實際套用的 scoring_rule_id。

revoke insert, update, delete on submission_scores from public, authenticated, anon;

create or replace function save_submission_score(p_submission_id uuid, p_score_item_id uuid, p_raw_value numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_round_id uuid;
  v_item_rule_id uuid;
  v_applicable_rule_id uuid;
begin
  select r.competition_id, s.round_id into v_competition_id, v_round_id
  from submissions s join rounds r on r.id = s.round_id
  where s.id = p_submission_id;

  if v_competition_id is null then
    raise exception 'submission not found';
  end if;

  if not can_manage_competition(v_competition_id, 'judge') then
    raise exception 'insufficient permission to score this submission';
  end if;

  if p_raw_value < 0 then
    raise exception 'raw_value cannot be negative';
  end if;

  select scoring_rule_id into v_item_rule_id from score_items where id = p_score_item_id;
  if v_item_rule_id is null then
    raise exception 'score item not found';
  end if;

  -- 這個 submission 所屬的 round 實際套用的 scoring_rule:round 專屬覆寫優先,
  -- 沒有的話用比賽預設(round_id is null 那筆)——跟 get_round_scores()/roundResults.ts
  -- 判斷「這一輪用哪套規則」的邏輯一致,不要有第二份判斷邏輯各自維護。
  select id into v_applicable_rule_id from scoring_rules where round_id = v_round_id;
  if v_applicable_rule_id is null then
    select id into v_applicable_rule_id from scoring_rules where competition_id = v_competition_id and round_id is null;
  end if;

  if v_item_rule_id is distinct from v_applicable_rule_id then
    raise exception 'score item does not belong to this submission''s applicable scoring rule';
  end if;

  insert into submission_scores (submission_id, score_item_id, raw_value, entered_by)
  values (p_submission_id, p_score_item_id, p_raw_value, auth.uid())
  on conflict (submission_id, score_item_id) do update set raw_value = excluded.raw_value, entered_by = excluded.entered_by;
end;
$$;
grant execute on function save_submission_score(uuid, uuid, numeric) to authenticated;
