-- Phase 4a:match_votes 支援投給「隊伍」而不只是投給「個人」。team 賽事的
-- matches 產生時機(報名截止/前一輪確認結果)早於投稿送出時機(投稿截止前),
-- registration_a_id/b_id 在產生當下根本沒有值可填(這一輪的官方投稿還不存在)。
-- 投票結果要用 team_a_id/team_b_id 才能正確表示「投給哪一隊」,不能勉強塞
-- registration_id 硬套用既有機制。

alter table match_votes alter column chosen_registration_id drop not null;
alter table match_votes add column chosen_team_id uuid references teams(id) on delete cascade;
alter table match_votes add constraint match_votes_exactly_one_choice check (
  (chosen_registration_id is not null and chosen_team_id is null)
  or (chosen_registration_id is null and chosen_team_id is not null)
);

-- 改寫驗證 trigger:分岔處理個人賽事(維持原邏輯)跟 team 賽事(chosen_team_id
-- 必須是這場對戰的 team_a_id/team_b_id 之一;投票者只要是這兩隊任一隊的成員就
-- 不能投,不論投哪邊——跟「不能投自己參與的場次」同一個精神,team 賽事下擴大成
-- 「不能投自己隊參與的場次」)。
create or replace function check_match_vote_validity()
returns trigger language plpgsql as $$
declare
  v_reg_a uuid;
  v_reg_b uuid;
  v_team_a uuid;
  v_team_b uuid;
  v_round_id uuid;
  v_voting_opens_at timestamptz;
  v_voting_closes_at timestamptz;
begin
  select m.registration_a_id, m.registration_b_id, m.team_a_id, m.team_b_id, m.round_id
    into v_reg_a, v_reg_b, v_team_a, v_team_b, v_round_id
  from matches m where m.id = new.match_id;
  if v_round_id is null then
    raise exception 'match % not found', new.match_id;
  end if;

  select r.voting_opens_at, r.voting_closes_at into v_voting_opens_at, v_voting_closes_at
  from rounds r where r.id = v_round_id;
  if v_voting_opens_at is null or now() < v_voting_opens_at then
    raise exception 'voting has not opened for this round yet';
  end if;
  if v_voting_closes_at is null or now() > v_voting_closes_at then
    raise exception 'voting has closed for this round';
  end if;

  if v_team_a is not null or v_team_b is not null then
    if new.chosen_team_id is null or (new.chosen_team_id <> v_team_a and new.chosen_team_id <> v_team_b) then
      raise exception 'chosen team is not part of this match';
    end if;
    if exists (
      select 1 from team_members tm join registrations r on r.id = tm.registration_id
      where tm.team_id in (v_team_a, v_team_b) and r.user_id = new.voter_id
    ) then
      raise exception 'cannot vote on your own team''s match';
    end if;
  else
    if new.chosen_registration_id is null or (new.chosen_registration_id <> v_reg_a and new.chosen_registration_id <> v_reg_b) then
      raise exception 'chosen registration is not part of this match';
    end if;
    if exists (
      select 1 from registrations r where r.id in (v_reg_a, v_reg_b) and r.user_id = new.voter_id
    ) then
      raise exception 'cannot vote on your own match';
    end if;
  end if;

  return new;
end;
$$;
