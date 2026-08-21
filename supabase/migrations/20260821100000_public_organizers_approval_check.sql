-- 獨立複查抓到:主辦資格改成審核制(ADR-0014)之後,list_public_organizers() 這支
-- 公開 /organizers 名單用的 RPC 忘記一起補 host_approved_at is not null——後台說
-- 「這個人還在待審核」,公開頁面卻照樣把他當成正式主辦人列出來,審核制度的公開
-- 信任模型跟後台狀態不一致。

create or replace function list_public_organizers()
returns table (id uuid, display_name text, avatar_url text, bio text, hosted_count bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.display_name, p.avatar_url, p.bio, count(c.id) as hosted_count
  from profiles p
  join competitions c on c.organizer_id = p.id
  where p.host_setup_completed = true and p.host_approved_at is not null and p.host_revoked_at is null
  group by p.id, p.display_name, p.avatar_url, p.bio
  order by count(c.id) desc, p.display_name;
$$;
