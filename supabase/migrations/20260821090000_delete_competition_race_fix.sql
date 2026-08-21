-- 獨立複查抓到:delete_competition() 的「查報名數 → 刪除」不是原子操作。用暫時的
-- 診斷 function(diag_delete_competition_race,已在下一個 migration 清掉)插入
-- pg_sleep 重現過:主辦人的刪除卡在檢查完「報名數=0」之後、真的刪除之前的窗口時,
-- 另一個使用者同時報名成功(201),但隨後被 DELETE 的 CASCADE 一起清掉,使用者
-- 收到「報名成功」卻悄悄消失,完全沒有錯誤訊息。
--
-- 修法:先對這一列上 FOR UPDATE 鎖,再查報名數,全部在同一個 transaction 內。
-- FOR UPDATE 跟 FK 檢查用的 FOR KEY SHARE 互斥——鎖定期間任何 INSERT INTO
-- registrations 參照這場比賽都會被擋住等待,直到這個 transaction 結束才能繼續;
-- 如果最後真的刪除了,等待中的報名會拿到清楚的外鍵錯誤(比賽不存在),而不是
-- 悄悄消失的假成功。已用注入延遲的併發測試驗證:修復前 registration 被吃掉,
-- 修復後 registration insert 正確地被擋下並回報失敗。

create or replace function delete_competition(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_is_organizer boolean;
  v_locked_id uuid;
  v_registration_count int;
begin
  select is_competition_organizer(p_competition_id) into v_is_organizer;

  if not v_is_organizer and not is_platform_admin() then
    raise exception 'insufficient permission to delete this competition';
  end if;

  select id into v_locked_id from competitions where id = p_competition_id for update;
  if v_locked_id is null then
    raise exception 'competition not found';
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
