-- 公開主辦人名單。anon 對 profiles 沒有 host_revoked_at 的欄位讀取權限(ADR-0010 刻意只給
-- authenticated 本人看撤除狀態,不公開給匿名訪客),所以不能直接讓前端下 anon 查詢再自己過濾
-- revoked——用 SECURITY DEFINER function 在內部做過濾,回傳的欄位本來就是公開安全的欄位。
create or replace function list_public_organizers()
returns table (id uuid, display_name text, avatar_url text, bio text, hosted_count bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.display_name, p.avatar_url, p.bio, count(c.id) as hosted_count
  from profiles p
  join competitions c on c.organizer_id = p.id
  where p.host_setup_completed = true and p.host_revoked_at is null
  group by p.id, p.display_name, p.avatar_url, p.bio
  order by count(c.id) desc, p.display_name;
$$;

grant execute on function list_public_organizers() to anon, authenticated;
