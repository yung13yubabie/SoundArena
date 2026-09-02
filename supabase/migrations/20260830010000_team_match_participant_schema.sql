-- 「隊伍賽真正支援對戰單位」——grilling 確認的完整設計(見 ADR-0054)。這是
-- Phase 1:schema 骨架 + team members 自己的讀取權限(現有 teams/team_members
-- 只放行 review 權限持有者讀,一般隊員完全讀不到自己隊伍的資料,這次的設計需要
-- 隊員互相看到候選投稿,順便補上這個 RLS 缺口)。

-- 隊長:分組時系統隨機指定一人,之後可轉讓。
alter table teams add column captain_registration_id uuid references registrations(id) on delete set null;

-- 隊員本人要能看到自己隊伍的成員名單(後台換組面板、隊員互相看候選投稿都需要)。
create policy "teams readable by own members" on teams for select using (
  exists (
    select 1 from team_members tm join registrations r on r.id = tm.registration_id
    where tm.team_id = teams.id and r.user_id = auth.uid()
  )
);
create policy "team_members readable by own team" on team_members for select using (
  exists (
    select 1 from team_members tm2 join registrations r on r.id = tm2.registration_id
    where tm2.team_id = team_members.team_id and r.user_id = auth.uid()
  )
);

-- 投稿:team 候選版本支援。一隊在一輪裡可能有好幾筆候選投稿(隊內任何人各自最多
-- 一筆,沿用既有 unique(round_id, registration_id) 不用改),team_id 標記這筆屬於
-- 哪一隊,is_team_selected 標記隊長選定送出的那一筆(同一隊同一輪最多一筆為 true,
-- 用底下的 partial unique index 保證)。個人賽(非 team grouping)的投稿 team_id
-- 維持 null,is_team_selected 對個人賽沒有意義,維持預設 false 不使用。
alter table submissions add column team_id uuid references teams(id) on delete cascade;
alter table submissions add column is_team_selected boolean not null default false;
create unique index submissions_one_selected_per_team_round on submissions (team_id, round_id) where is_team_selected;

-- 隊員(不限自己)要能看到同隊其他人上傳的候選投稿,才能讓隊長從中挑選。
create policy "submissions readable by teammates" on submissions for select using (
  team_id is not null and exists (
    select 1 from team_members tm join registrations r on r.id = tm.registration_id
    where tm.team_id = submissions.team_id and r.user_id = auth.uid()
  )
);

-- matches:team 對戰配對。team_a_id/team_b_id 才是 team 賽事真正的配對/戰績依據
-- (跟隊長是誰脫鉤——隊長可以轉讓,但戰績必須認 team 本身,不能靠某個人的
-- registration_id 追蹤,不然轉讓後戰績會斷在不同人身上算不出來)。
-- registration_a_id/registration_b_id 對 team 賽事填隊伍目前正式送出投稿的
-- registration_id,讓既有的整套投票/顯示程式碼(MatchVoteList、/vote 頁面等)
-- 完全不用改就能運作——team_a_id/team_b_id 只有敗場數計算、整隊淘汰、下一輪
-- 配對這幾個新邏輯會用到。個人賽事的 matches,team_a_id/team_b_id 維持 null。
alter table matches add column team_a_id uuid references teams(id) on delete cascade;
alter table matches add column team_b_id uuid references teams(id) on delete cascade;
