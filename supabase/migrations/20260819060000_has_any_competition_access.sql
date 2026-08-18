-- proxy.ts 的角色級路由保護要用:完全沒主辦、也不是任何比賽協作者的人,不該看到
-- /admin/review、/admin/schedule、/admin/collaborators、/judge 這些「管理特定比賽」的
-- 頁面(RLS 早就擋得住實際資料存取,這裡補的是 route 層級,避免完全無關的人打開一個
-- 空蕩蕩的管理介面)。輕量 EXISTS 查詢,不是完整撈清單,middleware 裡跑起來成本低。

create or replace function has_any_competition_access()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from competitions where organizer_id = auth.uid())
      or exists (select 1 from competition_collaborators where user_id = auth.uid());
$$;

grant execute on function has_any_competition_access() to authenticated;
