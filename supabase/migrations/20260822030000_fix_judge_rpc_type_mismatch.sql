-- 真實 PoC 抓到 20260822020000 的 judge_submissions_for_round() 有型別不匹配 bug:
-- registrations.status 實際型別是 participant_status(自訂 enum),不是 text,
-- RETURN QUERY 要求查詢欄位型別跟宣告的 RETURNS TABLE 完全一致,執行時噴
-- 「structure of query does not match function result type」。補上顯式轉型。

create or replace function judge_submissions_for_round(p_round_id uuid)
returns table(submission_id uuid, title text, registration_id uuid, registration_status text)
language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  select competition_id into v_competition_id from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;
  if not can_manage_competition(v_competition_id, 'judge') then
    raise exception 'insufficient permission to judge this round';
  end if;

  return query
    select s.id, s.title, r.id, r.status::text
    from submissions s
    join registrations r on r.id = s.registration_id
    where s.round_id = p_round_id and s.status = 'approved';
end;
$$;
