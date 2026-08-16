-- 20260816120000 的 column-level REVOKE 沒生效(anon 仍能查到 line_user_id)。
-- 最可能原因:Supabase 預設的欄位授權是下給 PUBLIC 這個偽角色,而不是只下給
-- anon/authenticated 個別角色——只 revoke 特定角色不會蓋掉 PUBLIC 的授權。
-- 這裡連 PUBLIC 一起收回,並手動通知 PostgREST 重載 schema cache,
-- 避免權限變更因為快取沒更新而暫時看不出效果。

revoke update on profiles from public;
grant update (display_name, avatar_url, bio, social_link, featured_track_url, host_setup_completed)
  on profiles to authenticated;

revoke select (line_user_id, discord_user_id) on profiles from public;

notify pgrst, 'reload schema';
