-- 資安複查發現:competitions 的 UPDATE policy 是 row-level(can_manage_competition
-- 的 'format' 或 'schedule' 任一權限),但沒有欄位限制。saveSchedule() 只想改 5 個
-- 時程欄位,但 RLS 允許的其實是整個 row——一個只有 schedule 權限的 Collaborator,
-- 繞過 UI 直接打 PostgREST,理論上可以改 name/slug/is_public/anonymity_mode,
-- 甚至 organizer_id(能不能真的造成 ownership escalation 還要看有沒有其他限制擋,
-- 但「可修改欄位過寬」本身已經成立,不該讓它有機會發生)。
-- 修法:比照 saveSchedule() 實際只用到的欄位,收成一支 RPC,competitions 的 UPDATE
-- 全面收回,不再開放任何欄位給 authenticated 直接寫。

revoke update on competitions from authenticated;

create or replace function save_competition_schedule(
  p_competition_id uuid,
  p_promotion_starts_at timestamptz,
  p_promotion_ends_at timestamptz,
  p_announcement_starts_at timestamptz,
  p_announcement_ends_at timestamptz,
  p_registration_closes_at timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_competition(p_competition_id, 'schedule') then
    raise exception 'insufficient permission to edit this competition''s schedule';
  end if;

  update competitions
  set promotion_starts_at = p_promotion_starts_at,
      promotion_ends_at = p_promotion_ends_at,
      announcement_starts_at = p_announcement_starts_at,
      announcement_ends_at = p_announcement_ends_at,
      registration_closes_at = p_registration_closes_at
  where id = p_competition_id;
end;
$$;

grant execute on function save_competition_schedule(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
