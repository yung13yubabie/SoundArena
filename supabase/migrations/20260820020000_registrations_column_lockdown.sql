-- 資安複查真實 PoC 確認:registrations 的 INSERT policy 只檢查 `auth.uid() = user_id`
-- (row-level),沒有欄位層級限制——攻擊者可以在自己的報名 INSERT payload 裡直接夾帶
-- `review_status: 'approved'`,繞過 review_registration() 的審核流程直接讓自己過審。
-- 修法沿用 profiles/comments/feedback 已經在用的「revoke 再用 column GRANT 開白名單」
-- 手法:只開放 registerForCompetition() 實際會用到的四個欄位,其餘(review_status/
-- is_public/notifications_enabled/status/eliminated_in_round_id...)一律不給直接寫,
-- 全部強制走既有的 SECURITY DEFINER function(resubmit_registration/review_registration/
-- set_registration_public/set_registration_notifications)。

revoke insert, update on registrations from authenticated;
grant insert (competition_id, user_id, display_name, suno_handle) on registrations to authenticated;

-- judge/actions.ts 的 setEliminated() 原本直接 UPDATE registrations(只受 row-level RLS
-- 保護),上面的 revoke 會讓它壞掉,順便修成跟 review_registration() 同一套 RPC 模式。
create or replace function set_registration_eliminated(p_registration_id uuid, p_round_id uuid, p_eliminated boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  select competition_id into v_competition_id from registrations where id = p_registration_id;
  if v_competition_id is null then
    raise exception 'registration not found';
  end if;

  if not can_manage_competition(v_competition_id, 'judge') then
    raise exception 'insufficient permission to mark elimination for this registration';
  end if;

  update registrations
  set status = case when p_eliminated then 'eliminated' else 'active' end,
      eliminated_in_round_id = case when p_eliminated then p_round_id else null end
  where id = p_registration_id;
end;
$$;

grant execute on function set_registration_eliminated(uuid, uuid, boolean) to authenticated;
