-- ADR-0005:留言內容/認可度只要比賽公開就能看,不用等該輪身份揭露;
-- 延後揭露的只有「commenter 是誰」。原本的 select/insert policy 整個綁在
-- round_identity_revealed() 上,這輪換掉。

drop policy "comments readable when round revealed" on comments;
drop policy "comments insertable by anyone once revealed" on comments;

create policy "comments readable when competition public" on comments for select using (
  exists (
    select 1 from submissions s
    join rounds r on r.id = s.round_id
    join competitions c on c.id = r.competition_id
    where s.id = comments.submission_id and c.is_public = true
  )
);

create policy "comments insertable by anyone when competition public" on comments for insert with check (
  auth.uid() = commenter_id
  and endorsement_percent = 0
  and exists (
    select 1 from submissions s
    join rounds r on r.id = s.round_id
    join competitions c on c.id = r.competition_id
    where s.id = comments.submission_id and c.is_public = true
  )
);

-- commenter_id 不開放任何人(含 Organizer/Collaborator)直接讀——留言者身份的揭露邏輯
-- 只能透過 get_submission_comments() 這個 function 走,不能靠 RLS 做到「這一列給讀,
-- 但這一欄不給讀」,只能靠欄位級 GRANT/REVOKE(這次直接把 profiles 那次踩過的坑
-- 一次做對:revoke 要連 public 這個偽角色一起收,不能只收 anon/authenticated)。
revoke select on comments from public, authenticated, anon;
grant select (id, submission_id, body, endorsement_percent, endorsed_at, created_at, updated_at)
  on comments to anon, authenticated;

create or replace function get_submission_comments(p_submission_id uuid)
returns table(
  comment_id uuid,
  body text,
  commenter_display_name text,
  is_own_comment boolean,
  endorsement_percent numeric,
  endorsed_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_round_id uuid;
  v_revealed boolean;
begin
  v_round_id := submission_round_id(p_submission_id);
  v_revealed := round_identity_revealed(v_round_id);

  return query
    select
      c.id,
      c.body,
      case when v_revealed or c.commenter_id = auth.uid() then p.display_name else null end,
      c.commenter_id = auth.uid(),
      c.endorsement_percent,
      c.endorsed_at,
      c.created_at
    from comments c
    join profiles p on p.id = c.commenter_id
    where c.submission_id = p_submission_id
    order by c.created_at;
end;
$$;

grant execute on function get_submission_comments(uuid) to anon, authenticated;
