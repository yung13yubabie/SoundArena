-- ADR-0010:PlatformAdmin 可撤除 Organizer 資格,且無法自助恢復。
-- 用時間戳記而不是把 host_setup_completed 反轉——要區分「從沒設定過」跟「設定過但被撤除」
-- 兩種不同狀態,兩者導向的畫面不同(見 CONTEXT.md OrganizerRevocation)。
--
-- 這個欄位刻意不加進既有的
-- `grant update (display_name, ..., host_setup_completed) on profiles to authenticated`
-- 白名單裡——新欄位預設沒有任何人能自己改,只能透過下面兩個 SECURITY DEFINER function
-- (檢查 is_platform_admin())寫入,達到「只有 PlatformAdmin 能撤除/恢復」的效果。

alter table profiles add column host_revoked_at timestamptz;

-- 只給 authenticated 讀(本人要能看到自己被撤除的畫面),不給 anon——這是內部把關狀態,
-- 不是要公開給匿名訪客看的資訊(公開檔案頁的「主辦過 N 場比賽」不受這個欄位影響,見 ADR-0010)。
grant select (host_revoked_at) on profiles to authenticated;

create or replace function revoke_organizer(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'only platform admin can revoke organizer status';
  end if;

  update profiles set host_revoked_at = now() where id = p_profile_id;
end;
$$;

create or replace function reinstate_organizer(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'only platform admin can reinstate organizer status';
  end if;

  update profiles set host_revoked_at = null where id = p_profile_id;
end;
$$;
