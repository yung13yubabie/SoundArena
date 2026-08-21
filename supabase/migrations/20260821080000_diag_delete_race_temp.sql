-- 暫時診斷用:模擬 delete_competition() 的「查報名數 → 刪除」關鍵區間,插入
-- pg_sleep 把時間窗放大到可以穩定測試,並用參數切換要不要先上 FOR UPDATE 鎖,
-- 拿來同時驗證「舊寫法真的會遺失併發報名」跟「新寫法確實會擋住」兩種情況。
-- 驗證完就整支刪掉,不是正式功能。

create or replace function diag_delete_competition_race(p_competition_id uuid, p_use_lock boolean, p_sleep_seconds numeric)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_locked_id uuid;
  v_registration_count int;
begin
  if p_use_lock then
    select id into v_locked_id from competitions where id = p_competition_id for update;
    if v_locked_id is null then
      return 'not found';
    end if;
  end if;

  select count(*) into v_registration_count from registrations where competition_id = p_competition_id;
  if v_registration_count > 0 then
    return 'aborted: found ' || v_registration_count || ' registrations before sleep';
  end if;

  perform pg_sleep(p_sleep_seconds);

  delete from competitions where id = p_competition_id;
  return 'deleted (registration count was 0 at check time)';
end;
$$;

grant execute on function diag_delete_competition_race(uuid, boolean, numeric) to authenticated;
