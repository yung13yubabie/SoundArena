-- Phase 4c:matches.winner_registration_id 對 team 賽事沒有意義(registration_a_id/
-- b_id 本身就是 null),贏家判定要記錄在 team 層級才能供敗場數計算/整隊淘汰使用。
alter table matches add column winner_team_id uuid references teams(id) on delete cascade;
