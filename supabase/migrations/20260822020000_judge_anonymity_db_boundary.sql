-- 第三方 SaaS 稽核報告獨立複查後確認屬實(ADR-0020 SA-001):/judge 頁面 UI 刻意
-- 只顯示「匿名作品 #N」(judge/page.tsx 的 header 文字明確承諾「即使你是主辦本人」),
-- 但這只是前端選擇不顯示——`registrations readable by organizer or collaborator`
-- 這條 policy 是整列 SELECT,對持有 judge 權限的協作者一樣開放,任何合法持有
-- judge 權限的帳號都能直接對 registrations 下 SELECT 拿到 user_id/display_name/
-- suno_handle。`submissions readable by organizer or collaborator` policy 同一個
-- 問題——sharer_handle/suno_share_url 本身就是身份資訊,judge 權限一樣整列可讀。
--
-- RLS 是列級不是欄位級,沒辦法「這幾欄給 review、那幾欄給 judge」,所以修法是:
-- 兩張表的「organizer or collaborator」讀取 policy 只留給 review 權限(這是
-- /admin/review 比對 Suno 帳號本來就需要的合法用途),judge 權限改成透過這支
-- 新的 SECURITY DEFINER RPC 拿資料——只回傳評分真正需要的欄位(submission id、
-- 標題、registration id、是否已淘汰),不含任何身份欄位。
--
-- 這個改動不影響「主辦人本人」的存取:can_manage_competition() 對真正的
-- Organizer(is_competition_organizer() 為真)會直接放行,跟傳入哪個 permission
-- 字串無關,所以組織者仍然透過原本的 review 分支看到一切——被收窄的只有「單純
-- 被邀請、只給了 judge 權限、沒有 review 權限」的協作者這一種角色。
--
-- 也確認過 judge/page.tsx 目前沒有任何播放功能(JudgeBoard 沒有接 PlayerBar/
-- getSubmissionPlaybackUrl),所以收窄 submissions 的 judge 讀取權限不會讓任何
-- 現有功能變壞。

create or replace function judge_submissions_for_round(p_round_id uuid)
returns table(submission_id uuid, title text, registration_id uuid, registration_status text)
language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  select competition_id into v_competition_id from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;
  if not can_manage_competition(v_competition_id, 'judge') then
    raise exception 'insufficient permission to judge this round';
  end if;

  return query
    select s.id, s.title, r.id, r.status
    from submissions s
    join registrations r on r.id = s.registration_id
    where s.round_id = p_round_id and s.status = 'approved';
end;
$$;
grant execute on function judge_submissions_for_round(uuid) to authenticated;

drop policy "registrations readable by organizer or collaborator" on registrations;
create policy "registrations readable by organizer or collaborator" on registrations for select using (
  exists (select 1 from competitions c where c.id = registrations.competition_id and can_manage_competition(c.id, 'review'))
);

drop policy "submissions readable by organizer or collaborator" on submissions;
create policy "submissions readable by organizer or collaborator" on submissions for select using (
  exists (
    select 1 from rounds r join competitions c on c.id = r.competition_id
    where r.id = submissions.round_id and can_manage_competition(c.id, 'review')
  )
);
