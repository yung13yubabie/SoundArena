-- 公開結果頁需要的資料存取——SPEC.md 第8節要求「完整計算公式必須公開,參賽者與投票者都
-- 能看到分數是怎麼算出來的」,但目前 votes/submission_scores 的 RLS 只開放給投票者本人跟
-- 該比賽的 Organizer,沒有公開讀取路徑;submissions/registrations 的公開讀取又是綁在「使用者
-- 自己選擇要不要在個人檔案展示」這個完全不同的開關上,不能直接借用。
--
-- 不新增更多 RLS policy 疊加判斷(anonymity_mode + 是否為決賽 + 投票是否截止,條件組合起來
-- 用 RLS 表達容易顧此失彼),改用兩個 SECURITY DEFINER function 把「這一輪的結果現在能不能被
-- 公開看到、身份要不要揭露」這個邏輯集中寫在一個地方,回傳的欄位本身就是安全的聚合值
-- (票數加總、分數),不會洩漏 votes.voter_id / voter_ip 這種個別投票紀錄。

create or replace function get_round_submissions(p_round_id uuid)
returns table(submission_id uuid, title text, display_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_is_public boolean;
  v_voting_closes_at timestamptz;
  v_anonymity anonymity_mode;
  v_round_index int;
  v_max_round_index int;
  v_revealed boolean;
begin
  select r.competition_id, c.is_public, r.voting_closes_at, c.anonymity_mode, r.round_index
    into v_competition_id, v_is_public, v_voting_closes_at, v_anonymity, v_round_index
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;

  if v_competition_id is null or not v_is_public then return; end if;
  if v_voting_closes_at is null or v_voting_closes_at > now() then return; end if;

  select max(round_index) into v_max_round_index from rounds where competition_id = v_competition_id;

  v_revealed := case v_anonymity
    when 'fully_public' then true
    when 'per_round_anonymous' then true
    when 'full_anonymous_until_final' then v_round_index = v_max_round_index
    else false
  end;

  return query
    select s.id, s.title, case when v_revealed then reg.display_name else null end
    from submissions s
    join registrations reg on reg.id = s.registration_id
    where s.round_id = p_round_id and s.status = 'approved';
end;
$$;

grant execute on function get_round_submissions(uuid) to anon, authenticated;

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
      case when t.key = 'vote'
        then (select count(*) from votes v where v.submission_id = s.id and v.round_id = p_round_id)::numeric
        else coalesce((select ss.raw_value from submission_scores ss where ss.submission_id = s.id and ss.score_item_id = si.id), 0)
      end
    from submissions s
    cross join score_items si
    left join score_item_templates t on t.id = si.template_id
    where s.round_id = p_round_id and s.status = 'approved' and si.scoring_rule_id = v_scoring_rule_id;
end;
$$;

grant execute on function get_round_scores(uuid) to anon, authenticated;

-- Discovery/結果頁的「開放投票中/已截止」輪次清單需要能公開查 rounds 的投票時間欄位——
-- 現有 "rounds readable when competition readable" 已經涵蓋 is_public 比賽,這裡不用新增。
