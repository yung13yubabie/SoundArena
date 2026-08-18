-- 這輪視覺驗證 /admin/collaborators 時抓到的真實缺口:profiles 現有的 SELECT policy
-- (self / platform admin / organizing a public competition / host_setup_completed /
-- has a public registration)沒有一條涵蓋「我是這場比賽的協作者,想看看團隊裡其他人的
-- 名字/頭像」——PostgREST 的 profiles(...) embed 會因為 RLS 擋住而悄悄回傳 null,UI 端只能
-- 顯示 fallback「未命名使用者」,不會報錯,很容易被忽略。
--
-- 只開放 display_name/avatar_url(既有欄位級 GRANT 早就排除 line_user_id/discord_user_id,
-- 不論這條 row-level policy 讓哪些列可見,敏感欄位都不會外洩),範圍限定在「同一場比賽的
-- Organizer 與 Collaborator 互看」,不是開放任意使用者互看。

create policy "profiles readable by fellow competition collaborators" on profiles for select using (
  exists (
    select 1 from competition_collaborators cc
    where cc.user_id = profiles.id
      and (is_competition_organizer(cc.competition_id) or is_competition_collaborator(cc.competition_id))
  )
  or exists (
    select 1 from competitions c
    where c.organizer_id = profiles.id
      and is_competition_collaborator(c.id)
  )
);
