-- 團隊分組(下一支 migration)需要一個乾淨的「這一輪淘汰名單已經定案」訊號,
-- 不能用 voting_closes_at——投票截止跟主辦人真的按過哪些人淘汰之間有空窗期,
-- 這段期間分組會把還沒被淘汰、但即將被淘汰的人也分進下一輪隊伍,分錯。
--
-- 加一個明確的「確認本輪結果」動作,主辦人在 /judge 頁面標記完淘汰名單後手動按一次,
-- 這裡才是真正代表「這一輪結果已經定案」的時間點。
alter table rounds add column results_finalized_at timestamptz;

create or replace function finalize_round_results(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_voting_closes_at timestamptz;
begin
  select competition_id, voting_closes_at into v_competition_id, v_voting_closes_at
  from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;

  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to finalize this round';
  end if;

  if v_voting_closes_at is null or now() < v_voting_closes_at then
    raise exception 'cannot finalize a round before its voting has closed';
  end if;

  update rounds set results_finalized_at = now() where id = p_round_id;
end;
$$;

grant execute on function finalize_round_results(uuid) to authenticated;
