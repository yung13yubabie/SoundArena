-- 08-16 晚間追加:主辦人「主持人身分」檔案 + 參加者隱私設定
--
-- 順便修兩個做這輪功能時才發現的既有安全缺口(不是這輪新引入的):
--   1. "profiles updatable by self" 只檢查 row 擁有權,沒限制欄位——任何登入使用者
--      理論上可以直接 PATCH 自己的 is_platform_admin=true 自我提權。RLS 是列級,擋不了
--      欄位,要用 GRANT/REVOKE 做欄位級限制。
--   2. "profiles readable when organizing a public competition" 開放整列,任何人都能
--      查到公開比賽主辦人的 line_user_id/discord_user_id,即使前端只用到 display_name。
-- 兩個都是純粹收緊,不影響現有功能(目前沒有程式碼會寫入 line_user_id/discord_user_id,
-- 也沒有任何流程需要 authenticated 角色改 is_platform_admin)。

-- ============================================================================
-- profiles: 主持人身分欄位
-- ============================================================================

alter table profiles
  add column bio text,
  add column social_link text,
  add column featured_track_url text,
  add column host_setup_completed boolean not null default false;

-- 欄位級權限收緊(見檔頭說明)。先 revoke 掉 Supabase 預設的 GRANT ALL,
-- 再只開放使用者真的該能自己改的欄位。
revoke update on profiles from authenticated;
grant update (display_name, avatar_url, bio, social_link, featured_track_url, host_setup_completed)
  on profiles to authenticated;

revoke select (line_user_id, discord_user_id) on profiles from anon, authenticated;

-- ============================================================================
-- registrations: 參加者可以自選是否公開這筆參賽紀錄
-- ============================================================================

alter table registrations add column is_public boolean not null default false;

-- submissions: 審核備註(退回原因)
alter table submissions add column review_note text;

-- ============================================================================
-- 公開檔案頁需要的唯讀存取:僅限使用者自己標記為公開的紀錄
-- ============================================================================

create policy "registrations readable when public" on registrations for select using (is_public = true);

create policy "submissions readable when public" on submissions for select using (
  allow_public_playback = true
  and exists (select 1 from registrations r where r.id = submissions.registration_id and r.is_public = true)
);

-- ============================================================================
-- 參加者自助切換公開狀態:不開放整列 self-update(理由同 profiles),
-- 改用 security definer function 只動 is_public / allow_public_playback 這兩欄。
-- ============================================================================

create or replace function set_registration_public(p_registration_id uuid, p_is_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update registrations set is_public = p_is_public
  where id = p_registration_id and user_id = auth.uid();
end;
$$;

grant execute on function set_registration_public(uuid, boolean) to authenticated;

create or replace function set_submission_public(p_submission_id uuid, p_is_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update submissions s set allow_public_playback = p_is_public
  from registrations r
  where s.id = p_submission_id and s.registration_id = r.id and r.user_id = auth.uid();
end;
$$;

grant execute on function set_submission_public(uuid, boolean) to authenticated;
