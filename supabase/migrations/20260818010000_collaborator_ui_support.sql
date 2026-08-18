-- 這輪(08-18)把 Collaborator + Comment 的 UI 接上真實資料,需要兩個新的 SECURITY DEFINER
-- helper function,理由都是「PostgREST 查不到需要的東西」:

-- 1. 邀請協作者要用 email 找到對方的 profile id,但 profiles 表本身沒有 email 欄位
--    (email 只存在 auth.users,anon/authenticated 角色查不到那張表)。只回傳 id/display_name/
--    avatar_url,不回傳 email 本身,避免變成任意帳號的 email 存在性查詢工具被濫用在別的地方。
create or replace function find_profile_by_email(p_email text)
returns table(id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url
  from profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

grant execute on function find_profile_by_email(text) to authenticated;

-- 2. admin/format、admin/review、admin/schedule、judge 四頁原本各自查
--    `.eq("organizer_id", userId)`,協作者被邀請後在 UI 上完全找不到那場比賽(RLS 會放行
--    讀取,但查詢條件沒把 Collaborator 涵蓋進去)——這是 08-17 那輪 HANDOFF 就記錄的已知缺口。
--    p_permission ∈ ('review','format','schedule','judge','invite'),跟 has_collaborator_permission 共用同一組字串。
create or replace function get_manageable_competitions(p_permission text)
returns table(id uuid, name text, is_organizer boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, (c.organizer_id = auth.uid()) as is_organizer
  from competitions c
  where c.organizer_id = auth.uid()
     or exists (
       select 1 from competition_collaborators cc
       where cc.competition_id = c.id
         and cc.user_id = auth.uid()
         and (
           (p_permission = 'review' and cc.can_review)
           or (p_permission = 'format' and cc.can_edit_format)
           or (p_permission = 'schedule' and cc.can_edit_schedule)
           or (p_permission = 'judge' and cc.can_judge)
           or (p_permission = 'invite' and cc.can_invite)
         )
     )
  order by c.created_at desc;
$$;

grant execute on function get_manageable_competitions(text) to authenticated;
