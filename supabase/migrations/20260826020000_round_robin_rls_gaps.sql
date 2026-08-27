-- 接上一支 migration 才發現的兩個真實 RLS 缺口(建 /vote 配對投票頁面時發現):
-- 1. match_votes 完全沒開放任何 SELECT policy,連投票者自己查「這場我投過誰」都
--    查不到——votes 表有對應的「自己可以查自己投過誰」policy,match_votes 漏了。
-- 2. pools 的 SELECT policy 只給 review 權限持有者,但 /vote 頁面任何登入使用者
--    都需要讀到池名稱(顯示「第 N 池」這種對戰分組標籤),不是只有主辦人才需要。
create policy "match_votes readable by self" on match_votes for select using (auth.uid() = voter_id);

create policy "pools readable by authenticated" on pools for select using (auth.role() = 'authenticated');
