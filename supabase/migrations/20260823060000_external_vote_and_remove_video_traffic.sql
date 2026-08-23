-- 使用者這輪確認的評分機制調整:
--
-- 1. external_vote(外部投票)這個範本從建置以來就沒有真正的計分邏輯——跟任何
--    「額外加分」項目一樣落在 get_round_scores() 的 else 分支,只能由評審手動輸入
--    數字,沒有任何自動判斷。使用者確認的定義:只算「沒有在這場比賽報名過的
--    登入使用者」投的票——投票動作本身不變(任何人都能投,只擋自投),差別只在
--    「這一票算不算進 external_vote 這個計分項目」。
--
-- 2. video_traffic(影片流量)——SoundArena 是純音訊平台,從沒有任何影片上傳/
--    播放功能,這個範本從建置以來就是死的選項,使用者確認直接移除,不留著誤導
--    主辦人以為真的能用。
--
-- 簽章(p_round_id uuid)跟回傳型別都沒變,只是 CASE 分支裡多一條,直接
-- create or replace 就能取代。
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
    where s.round_id = p_round_id and s.status = 'approved' and si.scoring_rule_id = v_scoring_rule_id;
end;
$$;

-- video_traffic 是死選項,直接移除。第一次跑這個 migration 時被外鍵約束擋下——
-- score_items.template_id 是 on delete restrict,不會靜默 cascade——查出來是使用者
-- 自己的「好友測試賽」測試比賽真的選過這個範本(兩筆,分別 25%/0% 權重)。使用者
-- 確認整場比賽都是可以清掉的測試資料。只刪那兩筆 score_items 會讓同一個 scoring_rule
-- 剩下的加權項目總和變成 75%,違反 100% 總和的既有 constraint,且擅自調整其他項目的
-- 權重去補足,對「測試資料」這個定性來說是多此一舉——直接整場比賽一起清掉,不留
-- 半殘的測試設定。
delete from competitions where id = 'f9612b38-d8f6-4ead-88a1-09cca105a5c4';
delete from score_item_templates where key = 'video_traffic';
