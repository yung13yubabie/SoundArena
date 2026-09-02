-- 「隊伍賽真正支援對戰單位」全功能真實驗證(security-regression.mjs 新增的
-- 隊伍賽情境)跑出來的 3 個真 bug,逐一修好:

-- Bug A: submit_entry() 重新 drop+create 只補了 grant execute ... to service_role,
-- 沒有補跟 20260822140000_fix_submit_entry_public_grant_leak.sql 當初一樣的
-- revoke——Postgres 新建函式預設 PUBLIC 就有 execute,drop+create 等於把那次
-- 已經修好的 DB-02 洩漏重新打開(真實跑 security-regression.mjs 證實:一般
-- authenticated session 直接呼叫 submit_entry() 沒被拒絕)。
revoke execute on function submit_entry(uuid, uuid, uuid, text, text, text, text, text, boolean, text, text, boolean, uuid) from public, authenticated, anon;

-- Bug B: Phase 1 幫 team_members 加的 RLS policy 在自己的 USING 子句裡直接查
-- team_members 本身(self-referential subquery)——Postgres 評估這個 policy 時,
-- 子查詢又要對 team_members 套用同一條 policy,無限遞迴("infinite recursion
-- detected in policy for relation team_members")。teams/submissions 兩張表的
-- policy 子查詢也碰 team_members,同樣被拖著一起爆炸,任何一般 authenticated
-- session(不只是這次測試,submit/vote 頁面本身的真實查詢)碰到都會炸。改用
-- security definer 輔助函式(跟 can_manage_competition()/is_competition_collaborator()
-- 同一個慣例)繞開 RLS 自我遞迴。
create or replace function user_is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members tm join registrations r on r.id = tm.registration_id
    where tm.team_id = p_team_id and r.user_id = auth.uid()
  );
$$;

drop policy "teams readable by own members" on teams;
create policy "teams readable by own members" on teams for select using (
  user_is_team_member(teams.id)
);

drop policy "team_members readable by own team" on team_members;
create policy "team_members readable by own team" on team_members for select using (
  user_is_team_member(team_members.team_id)
);

drop policy "submissions readable by teammates" on submissions;
create policy "submissions readable by teammates" on submissions for select using (
  team_id is not null and user_is_team_member(submissions.team_id)
);

-- Bug C: matches.registration_a_id/registration_b_id 從建置以來就是 not null
-- (個人賽事一定填得到),team-aware 的配對函式(generate_single_elimination_
-- matches_for_round 等)插入 team 賽事的場次時這兩欄本來就沒有值可填,一直是
-- not null 沒改過,真的執行時直接違反 constraint 插入失敗。
alter table matches alter column registration_a_id drop not null;
alter table matches alter column registration_b_id drop not null;
