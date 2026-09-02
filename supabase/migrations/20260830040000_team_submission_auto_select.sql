-- Phase 3.5:投稿截止時間到了,但隊長還沒選定任何候選版本送出——grilling 確認
-- 系統自動選最後一筆候選送出(避免整隊因為忘記點選而白白被淘汰)。跟其他賽制
-- 的 check_and_form_pending_* 同一套 lazy-check 模式:冪等、自我驗證條件、
-- 任何人造訪相關頁面順便觸發都安全。
create or replace function auto_select_team_submissions_for_closed_rounds(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round record;
  v_team record;
  v_last_submission_id uuid;
begin
  for v_round in
    select id from rounds
    where competition_id = p_competition_id
      and submission_closes_at is not null
      and now() >= submission_closes_at
  loop
    for v_team in
      select distinct s.team_id
      from submissions s
      where s.round_id = v_round.id and s.team_id is not null
        and not exists (
          select 1 from submissions s2 where s2.team_id = s.team_id and s2.round_id = v_round.id and s2.is_team_selected
        )
    loop
      select id into v_last_submission_id
      from submissions
      where round_id = v_round.id and team_id = v_team.team_id
      order by created_at desc
      limit 1;

      if v_last_submission_id is not null then
        update submissions set is_team_selected = true where id = v_last_submission_id;
      end if;
    end loop;
  end loop;
end;
$$;
grant execute on function auto_select_team_submissions_for_closed_rounds(uuid) to authenticated;
