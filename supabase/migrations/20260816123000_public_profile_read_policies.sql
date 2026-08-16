-- /u/[id] 公開檔案頁需要能讀到「已完成主辦人身分設定」或「至少有一筆公開參賽紀錄」的
-- profiles row(欄位授權已經在前面的 migration 收緊到安全欄位,這裡只補列級可見性)。

create policy "profiles readable when host setup completed" on profiles for select using (
  host_setup_completed = true
);

create policy "profiles readable when has a public registration" on profiles for select using (
  exists (select 1 from registrations r where r.user_id = profiles.id and r.is_public = true)
);
