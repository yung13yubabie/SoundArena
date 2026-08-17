-- 把「留言認可加分」接進既有計分/公開結果管線:新增 score_item_templates 範本、
-- 讓 get_round_scores 認得這個 template key、get_round_submissions 改用上一個
-- migration 抽出來的 round_identity_revealed(),不要兩份揭露邏輯各自維護。

insert into score_item_templates (key, label, default_kind) values
  ('comment_endorsement', '留言認可加分', 'weighted');

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
    where s.round_id = p_round_id and s.status = 'approved';
end;
$$;

-- 「留言認可加分」的數值 = 這位投稿者(以留言者身份)在本輪對「別人的作品」留言、
-- 且被原作認可的百分比加總。呼應 ADR-0004:加分算在留言者「自己當輪投稿」的分數上,
-- 不是算在被留言的那篇作品上。
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
