-- 使用者明確要求把主辦資格從「自助送出即完成」改成「平台管理員審核制」——
-- 起因是有人隨手點了主辦人設定,建立了一場測試比賽,結果發現整個站沒有任何清除
-- 機制。決定:既有已經自助通過的主辦人帳號也要一起重新送審(不是只套用在未來
-- 新申請上),所以這裡直接加一個預設 null 的新欄位,不用另外寫「重置既有帳號」
-- 的邏輯——新欄位本來就對所有既有 row 是 null,自然等同於「全部變成待審核」。

alter table profiles add column host_approved_at timestamptz;
grant select (host_approved_at) on profiles to authenticated;

-- is_competition_organizer() 是 can_manage_competition() 的核心判斷,原本只檢查
-- 「這是不是你的比賽」+「沒被撤除主辦資格」。現在多一個條件:也必須是「已通過審核」
-- 的主辦人——這樣不用一一去改每一支依賴 can_manage_competition() 的 RPC/policy,
-- 被重置成待審核的既有主辦人,自動同時失去對「自己既有比賽」的管理權限,直到
-- 重新審核通過為止(不影響那些比賽的公開頁面/報名/投票——那些走的是各自獨立的
-- SELECT policy,不經過這支 function)。
create or replace function is_competition_organizer(p_competition_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competitions c
    join profiles p on p.id = c.organizer_id
    where c.id = p_competition_id
      and c.organizer_id = auth.uid()
      and p.host_revoked_at is null
      and p.host_approved_at is not null
  );
$$;

-- 建立新比賽是唯一一個「還沒有 competitions row 可以 join」的情境,原本靠
-- is_non_revoked_self() 單獨判斷,現在一併補上審核通過的條件。
create or replace function is_non_revoked_self()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select host_revoked_at is null and host_approved_at is not null from profiles where id = auth.uid()),
    false
  );
$$;

create or replace function approve_organizer_application(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'only platform admin can approve organizer applications';
  end if;
  update profiles set host_approved_at = now() where id = p_profile_id;
end;
$$;

grant execute on function approve_organizer_application(uuid) to authenticated;
