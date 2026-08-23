-- grilling 確認的設計轉向:原本 SPEC.md 第6節「淘汰結果...發送前需經人工審核確認」
-- 是純人工點選(見 judge/actions.ts 的 setEliminated())。使用者這輪明確要求改成
-- 通用的自動淘汰機制:每輪填一個「淘汰百分比」(不綁定任何特定賽制積木,單敗/雙敗/
-- 循環賽/月週期累積制這些標籤未來都共用同一套),「確認本輪結果」按下去的當下,
-- 系統依這輪目前的即時分數排名,自動淘汰墊底 floor(百分比 × 這輪還在比賽中的人數)。
-- 排名計算留在 Next.js 端做(重用 lib/ranking.ts 的 computeRanking(),見
-- judge/actions.ts 的 finalizeRoundResults())——不在這支 function 裡重寫一份 SQL
-- 版的排名公式,避免兩邊各自漂移。這支 function 只負責「驗證這份淘汰名單合法、
-- 套用它、鎖定這一輪不能重算」,不負責算分。
alter table rounds add column elimination_percent numeric;

drop function finalize_round_results(uuid);

create or replace function finalize_round_results(p_round_id uuid, p_eliminate_registration_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_voting_closes_at timestamptz;
  v_already_finalized timestamptz;
begin
  select competition_id, voting_closes_at, results_finalized_at
    into v_competition_id, v_voting_closes_at, v_already_finalized
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

  -- 冪等保護:重複呼叫如果沒有這道擋,會拿「已經被上一次呼叫淘汰過、人數已經
  -- 變少」的 active 人數重算一次百分比,多淘汰一批不該淘汰的人。
  if v_already_finalized is not null then
    raise exception 'this round has already been finalized';
  end if;

  -- p_eliminate_registration_ids 由呼叫端(finalizeRoundResults() server action)
  -- 依當下即時分數算好再傳進來——這裡只驗證每一筆真的屬於這場比賽、目前還是
  -- active,不屬於的直接忽略(不報錯),呼叫端不是任意使用者輸入,是同一支
  -- server action 算出來的內部資料,信任模型跟既有的 set_registration_eliminated()
  -- 一樣(有 review 權限就能標記任何人淘汰,這裡沒有加嚴)。
  update registrations
  set status = 'eliminated', eliminated_in_round_id = p_round_id
  where id = any(p_eliminate_registration_ids)
    and competition_id = v_competition_id
    and status = 'active';

  update rounds set results_finalized_at = now() where id = p_round_id;
end;
$$;

grant execute on function finalize_round_results(uuid, uuid[]) to authenticated;
