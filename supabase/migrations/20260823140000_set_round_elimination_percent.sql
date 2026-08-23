-- 每輪淘汰百分比是主辦人在賽制頁直接設定的輪次層級欄位,不綁定任何賽制積木
-- (grilling 確認:單敗/雙敗/循環賽/月週期累積制之後都共用這一套自動淘汰機制)。
-- rounds 表沒有開放給 authenticated 的 self-update RLS policy,比照 set_round_anonymity()
-- 同一套模式走 RPC。
create or replace function set_round_elimination_percent(p_round_id uuid, p_percent numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  select competition_id into v_competition_id from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;

  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to edit this round';
  end if;

  if p_percent is not null and (p_percent < 0 or p_percent > 100) then
    raise exception 'elimination percent must be between 0 and 100';
  end if;

  update rounds set elimination_percent = p_percent where id = p_round_id;
end;
$$;

grant execute on function set_round_elimination_percent(uuid, numeric) to authenticated;
