-- DB-09(b) grilling 確認:多輪比賽現在投稿/投票時間全部輪次共用同一組
-- (set_round_schedule_windows 一次套用到傳入的所有 round_id),沒辦法表達「兩輪
-- 之間有休息空檔」這種常見情境。
--
-- 設計:不新增額外的「是否覆寫」欄位——rounds.submission_opens_at 等 4 個欄位本來
-- 就是每輪各自的有效時程,set_round_schedule_windows()(賽制頁「時程設定」的整體
-- 套用)跟這支新 RPC(賽制建立頁,單一輪次專屬時程)寫的是同一組欄位,誰後寫誰生效。
-- 也就是說:不填per-round 專屬時程,這輪就維持整體時程套用的值(向下相容);填了
-- 之後,如果主辦人又跑一次「時程設定」頁的整體套用,會把這輪的專屬設定蓋掉——這是
-- 刻意的簡化(沒有另外做「鎖定不被覆蓋」的機制),UI 文案會提醒這個行為。
create or replace function set_round_schedule_override(
  p_round_id uuid,
  p_submission_opens_at timestamptz,
  p_submission_closes_at timestamptz,
  p_voting_opens_at timestamptz,
  p_voting_closes_at timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  select competition_id into v_competition_id from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;
  if not can_manage_competition(v_competition_id, 'schedule') then
    raise exception 'insufficient permission to edit this competition''s schedule';
  end if;

  update rounds set
    submission_opens_at = p_submission_opens_at,
    submission_closes_at = p_submission_closes_at,
    voting_opens_at = p_voting_opens_at,
    voting_closes_at = p_voting_closes_at
  where id = p_round_id;
end;
$$;
grant execute on function set_round_schedule_override(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
