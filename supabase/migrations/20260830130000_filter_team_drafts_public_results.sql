-- Phase 7b:/results 公開結果頁用的兩支 RPC 同樣要過濾掉 team 候選投稿草稿,
-- 不然公開結果會把同一隊沒被選中的候選版本也列進排行榜。
--
-- 除錯記錄:第一版錯把 get_round_submissions() 抄成 20260816140000 的初版
-- (用 competitions.anonymity_mode 判斷揭露),db push 直接報錯「type
-- "anonymity_mode" does not exist」——查證後發現這個型別/欄位早在
-- 20260822110000(第三方稽核 Anti-Slop 項目)就已經整個 drop 掉,揭露邏輯從
-- 20260817013000 起改用 round_identity_revealed() RPC(rounds.is_anonymous)。
-- 20260816140000 那份是被後面的 create or replace 取代掉的歷史版本,不是現行
-- 邏輯——這裡改成逐字複製 20260817013000(get_round_submissions)+
-- 20260823060000(get_round_scores,CASE 分支疊加到最新的那份)的真正現行版本,
-- 只在 where 子句加過濾條件,不手動重寫細節邏輯。
create or replace function get_round_submissions(p_round_id uuid)
returns table(submission_id uuid, title text, display_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_is_public boolean;
  v_voting_closes_at timestamptz;
  v_revealed boolean;
begin
  select r.competition_id, c.is_public, r.voting_closes_at
    into v_competition_id, v_is_public, v_voting_closes_at
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;

  if v_competition_id is null or not v_is_public then return; end if;
  if v_voting_closes_at is null or v_voting_closes_at > now() then return; end if;

  v_revealed := round_identity_revealed(p_round_id);

  return query
    select s.id, s.title, case when v_revealed then reg.display_name else null end
    from submissions s
    join registrations reg on reg.id = s.registration_id
    where s.round_id = p_round_id and s.status = 'approved'
      and (s.team_id is null or s.is_team_selected);
end;
$$;

create or replace function get_round_scores(p_round_id uuid)
returns table(submission_id uuid, score_item_id uuid, raw_value numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_is_public boolean;
  v_voting_closes_at timestamptz;
  v_scoring_rule_id uuid;
begin
  select r.competition_id, c.is_public, r.voting_closes_at
    into v_competition_id, v_is_public, v_voting_closes_at
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;

  if v_competition_id is null or not v_is_public then return; end if;
  if v_voting_closes_at is null or v_voting_closes_at > now() then return; end if;

  select id into v_scoring_rule_id from scoring_rules where round_id = p_round_id;
  if v_scoring_rule_id is null then
    select id into v_scoring_rule_id from scoring_rules where competition_id = v_competition_id and round_id is null;
  end if;
  if v_scoring_rule_id is null then return; end if;

  return query
    select s.id, si.id,
      case
        when t.key = 'vote' then
          (select count(*) from votes v where v.submission_id = s.id and v.round_id = p_round_id)::numeric
        when t.key = 'external_vote' then
          (
            select count(*) from votes v
            where v.submission_id = s.id and v.round_id = p_round_id
              and not exists (
                select 1 from registrations r2
                where r2.competition_id = v_competition_id and r2.user_id = v.voter_id
              )
          )::numeric
        when t.key = 'audience_ai_usage_rating' then
          coalesce(
            (select avg(v.ai_usage_rating) from votes v
             where v.submission_id = s.id and v.round_id = p_round_id and v.ai_usage_rating is not null),
            0
          )
        when t.key = 'comment_endorsement' then
          (
            select coalesce(sum(cm.endorsement_percent), 0)
            from comments cm
            join submissions commented_on on commented_on.id = cm.submission_id
            join registrations mine on mine.id = s.registration_id
            where commented_on.round_id = p_round_id
              and cm.commenter_id = mine.user_id
          )
        else
          coalesce((select ss.raw_value from submission_scores ss where ss.submission_id = s.id and ss.score_item_id = si.id), 0)
      end
    from submissions s
    cross join score_items si
    left join score_item_templates t on t.id = si.template_id
    where s.round_id = p_round_id and s.status = 'approved' and si.scoring_rule_id = v_scoring_rule_id
      and (s.team_id is null or s.is_team_selected);
end;
$$;
