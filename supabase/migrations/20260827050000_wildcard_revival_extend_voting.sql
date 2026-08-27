-- 外卡復活投票平手時(最高票不只一人)需要延長投票時間讓更多人投票,比照
-- set_round_schedule_override() 同一套權限/驗證模式,只開放調整還沒確認結果的事件。
create or replace function extend_wildcard_revival_voting(p_event_id uuid, p_new_closes_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_resolved_at timestamptz;
begin
  select competition_id, resolved_at into v_competition_id, v_resolved_at
  from wildcard_revival_events where id = p_event_id;
  if v_competition_id is null then
    raise exception 'wildcard revival event not found';
  end if;

  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to edit this wildcard revival event';
  end if;

  if v_resolved_at is not null then
    raise exception 'this wildcard revival event has already been resolved';
  end if;

  if p_new_closes_at <= now() then
    raise exception 'new closing time must be in the future';
  end if;

  update wildcard_revival_events set voting_closes_at = p_new_closes_at where id = p_event_id;
end;
$$;
grant execute on function extend_wildcard_revival_voting(uuid, timestamptz) to authenticated;
