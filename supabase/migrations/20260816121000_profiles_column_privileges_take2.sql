-- 前兩個 migration 的 column-level REVOKE 對 SELECT 沒生效——Postgres 的欄位權限判斷是
-- "table-level 授權 OR column-level 授權",只要 table-level 還留著 SELECT ON profiles,
-- 欄位級 REVOKE 完全不會限制到任何東西。Supabase 建表時預設是下 table-level
-- `grant select on profiles to anon, authenticated`,必須先把 table-level 整個收回,
-- 再用 column-level GRANT 只開放安全欄位,兩者順序不能反。
--
-- line_user_id/discord_user_id 全面排除在 anon/authenticated 的欄位授權之外(不只是
-- 排除在「其他人可見」之外,連 profile 擁有者自己都查不到)——目前沒有任何畫面需要顯示
-- 這兩個值給使用者本人看,SPEC.md 的 Notification Identity 設計裡它們本來就只是後端
-- 派發通知用的「目的地」,維持純 service_role-only 存取，模型更單純。

revoke select on profiles from anon, authenticated, public;

grant select (id, display_name, avatar_url, bio, social_link, featured_track_url,
              host_setup_completed, is_platform_admin, created_at)
  on profiles to anon, authenticated;

notify pgrst, 'reload schema';
