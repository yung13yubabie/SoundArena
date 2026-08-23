-- Grilling 確認的第二輪稽核追加項目:remove_round() 原本完全不檢查該輪是否已有
-- 真實投稿/選票,主辦人手滑就能默默刪光真實資料。比照 delete_competition() 的既有
-- 模式:一般主辦人只要這一輪已有真實投稿就完全擋下,PlatformAdmin 可在後台強制移除
-- (投稿都刪光了,votes 也會跟著 cascade,不需要另外查 votes——一輪有沒有真實選票
-- 必然以有真實投稿為前提)。
create or replace function remove_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_round_index int;
  v_min_idx int;
  v_max_idx int;
  v_submission_count int;
begin
  select competition_id, round_index into v_competition_id, v_round_index
  from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;
  if not can_manage_competition(v_competition_id, 'format') then
    raise exception 'insufficient permission to edit this competition';
  end if;

  select min(round_index), max(round_index) into v_min_idx, v_max_idx
  from rounds where competition_id = v_competition_id;
  if v_round_index = v_min_idx or v_round_index = v_max_idx then
    raise exception '初賽與決賽不可移除';
  end if;

  if not is_platform_admin() then
    select count(*) into v_submission_count from submissions where round_id = p_round_id;
    if v_submission_count > 0 then
      raise exception 'this round already has real submissions — ask a platform admin to remove it';
    end if;
  end if;

  delete from rounds where id = p_round_id;
end;
$$;
grant execute on function remove_round(uuid) to authenticated;
