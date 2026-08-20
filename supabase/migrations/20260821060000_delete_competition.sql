-- 使用者反映:主辦比賽後發現完全沒有清除的方法(誤點建立的測試比賽永遠留在站上)。
-- 決定:草稿期(還沒有任何人報名)主辦人可以自助刪除;一旦有真實報名紀錄,
-- 就只能請平台管理員刪除,避免主辦人單方面把參賽者的資料一起清掉。
--
-- 只給 Organizer 本人(不含 collaborator)——刪除是不可逆的破壞性動作,不像
-- format/schedule/review 那些可以委派的日常管理工作。Platform admin 不受
-- 草稿期限制,任何狀態都能刪。

create or replace function delete_competition(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_is_organizer boolean;
  v_registration_count int;
begin
  select is_competition_organizer(p_competition_id) into v_is_organizer;

  if not v_is_organizer and not is_platform_admin() then
    raise exception 'insufficient permission to delete this competition';
  end if;

  if not is_platform_admin() then
    select count(*) into v_registration_count from registrations where competition_id = p_competition_id;
    if v_registration_count > 0 then
      raise exception 'this competition already has real registrations — ask a platform admin to delete it';
    end if;
  end if;

  delete from competitions where id = p_competition_id;
end;
$$;

grant execute on function delete_competition(uuid) to authenticated;
