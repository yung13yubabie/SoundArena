-- 資安複查發現(真實 PoC 驗證,見對話記錄):ADR-0010 的 host_revoked_at 只在 Next.js
-- 頁面守門用到,is_competition_organizer()/can_manage_competition() 這條真正的 DB
-- 安全邊界完全沒檢查這個欄位——PlatformAdmin 在畫面上「撤除」了某人的主辦資格,
-- 那個人繞過 UI 直接打 PostgREST,對他既有比賽的 UPDATE、甚至建立全新比賽,一律照樣放行。
-- UI 撤權 ≠ Database 撤權。修法:把撤除狀態塞進判斷核心本身,一次修好所有走
-- can_manage_competition() 的地方(rounds/scoring/registrations review/submissions review/
-- votes 相關的 collaborator 判斷全部經過這條函式,不用逐一改)。

create or replace function is_competition_organizer(p_competition_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competitions c
    join profiles p on p.id = c.organizer_id
    where c.id = p_competition_id and c.organizer_id = auth.uid() and p.host_revoked_at is null
  );
$$;

-- competitions 的 INSERT policy 沒有既有比賽可以查 is_competition_organizer(),
-- 需要單獨一個「這個人自己有沒有被撤權」的檢查,擋掉被撤權的人繞過 UI 直接建新比賽。
create or replace function is_non_revoked_self()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select host_revoked_at is null from profiles where id = auth.uid()), false);
$$;

drop policy "competitions insertable by organizer" on competitions;
create policy "competitions insertable by organizer" on competitions for insert with check (
  auth.uid() = organizer_id and is_non_revoked_self()
);
