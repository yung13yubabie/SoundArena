-- 使用者這輪要求:觀眾投票的同一個動作裡,順便對「AI 使用方式」給 1-5 星評分
-- (跟評審評的是同一件事,只是換觀眾視角評)——ADR-0021 已經有評審這邊的 5 個
-- 模板,這裡補觀眾這邊的第 6 個,一樣算進最終加權總分,主辦人自己分配權重。
--
-- 決策記錄(使用者這輪明確選擇):評分入口綁在投票的同一個動作(不是獨立的
-- 瀏覽頁評分)、1-5 星評分(不是二選一)、算進最終排名(不是純資訊性展示)。
--
-- 直接加欄位在 votes 表,不開新表:投票本來就是「每人每輪最多一票」(unique
-- round_id+voter_id),評分是「對這張票投的那首作品順便評」,語意上是同一列資料,
-- 不是獨立的多對多關係——不需要 ai_usage_ratings 這種平行表。評分選填,不填就是
-- null,不計入平均(不是當 0 分拉低平均)。

alter table votes add column ai_usage_rating smallint;
alter table votes add constraint votes_ai_usage_rating_range check (ai_usage_rating is null or ai_usage_rating between 1 and 5);

insert into score_item_templates (key, label, description, default_kind) values
  ('audience_ai_usage_rating', '觀眾 AI 使用度評分', '觀眾投票時順便對這首作品的 AI 使用方式給 1-5 星評分(選填,平均計分)', 'weighted');

-- 簽章(p_round_id uuid)跟回傳型別(submission_id/score_item_id/raw_value)都沒變,
-- 只是 CASE 分支裡多一條——跟 ADR-0020/0021 那種「改參數列表/改回傳欄位」的情況
-- 不同,這裡單純 create or replace 就能正確取代,不用 drop。
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
    where s.round_id = p_round_id and s.status = 'approved' and si.scoring_rule_id = v_scoring_rule_id;
end;
$$;
