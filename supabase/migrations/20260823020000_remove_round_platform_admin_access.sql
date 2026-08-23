-- 真實 PoC 抓到:上一支 migration 加的「PlatformAdmin 可強制移除有真實投稿的輪次」
-- 從未生效過——remove_round() 最上層的權限檢查一路以來只看 can_manage_competition()
-- (organizer 或 collaborator),沒有 is_platform_admin() 的例外,跟 delete_competition()
-- 的既有模式不一致。PlatformAdmin 連檢查都到不了就先被這道最上層的閘擋下。
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
  if not can_manage_competition(v_competition_id, 'format') and not is_platform_admin() then
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
