-- feedback 原本刻意設計成「只能寫入、不能透過 API 讀取,只能靠 Supabase dashboard/
-- service_role 查看」。使用者確認這樣沒人會定期去翻資料庫,等於收了等於沒收,
-- 改成讓 PlatformAdmin 能在後台直接看到列表。

create policy "feedback readable by platform admin"
  on feedback for select
  using (is_platform_admin());

-- 需要 join 到留言者的 display_name,profiles 對 anon/authenticated 已經有
-- select 的 column grant(見 08-16 的 column-privileges migration),這裡不用再開。
