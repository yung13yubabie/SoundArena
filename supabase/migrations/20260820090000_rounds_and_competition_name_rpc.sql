-- ADR-0011 item 2:collaborator 權限是列級,不是欄位級。competitions/rounds 這兩張表
-- 的 UPDATE policy 刻意寫成「format 權限 or schedule 權限都能過」(因為 RLS 沒辦法只開放
-- 「這幾欄」給某個權限),副作用是只有 schedule 權限的 Collaborator,理論上能繞過 UI
-- 直接打 PostgREST 改 name/round_index/is_anonymous 這些其實屬於 format 的欄位,反過來
-- 只有 format 權限的 Collaborator 也能改到 schedule 專屬的時間欄位。
--
-- 這個 migration 也順便修一個真的壞掉的地方:competitions 的 UPDATE 已經在
-- 20260820040000 被整個 revoke 掉(只留 save_competition_schedule() 這個 RPC),
-- 但 admin/format/actions.ts 的 updateCompetitionMeta() 當時沒有一起改,現在改名字
-- 這個功能其實是壞的(打 API 會拿到 42501 permission denied for table competitions)。
--
-- 修法跟 submissions/registrations 同一套:rounds 的 INSERT/UPDATE/DELETE 全面收回,
-- 依照「這個操作屬於 format 還是 schedule」拆成對應的 SECURITY DEFINER RPC。
-- scoring_rules/score_items/round_format_blocks 三張表本來就只檢查 'format' 單一權限
-- (沒有 format-or-schedule 的 OR),不存在同樣的跨權限洩漏,這裡不動。

create or replace function update_competition_name(p_competition_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_competition(p_competition_id, 'format') then
    raise exception 'insufficient permission to edit this competition';
  end if;
  if trim(p_name) = '' then
    raise exception 'name cannot be empty';
  end if;
  update competitions set name = trim(p_name) where id = p_competition_id;
end;
$$;
grant execute on function update_competition_name(uuid, text) to authenticated;

revoke insert, update, delete on rounds from authenticated;

create or replace function create_initial_rounds(p_competition_id uuid, p_default_anonymous boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_competition(p_competition_id, 'format') then
    raise exception 'insufficient permission to edit this competition';
  end if;
  insert into rounds (competition_id, round_index, name, is_anonymous) values
    (p_competition_id, 1, '初賽', p_default_anonymous),
    (p_competition_id, 2, '決賽', p_default_anonymous);
end;
$$;
grant execute on function create_initial_rounds(uuid, boolean) to authenticated;

create or replace function add_round(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_final_round_id uuid;
  v_new_index int;
begin
  if not can_manage_competition(p_competition_id, 'format') then
    raise exception 'insufficient permission to edit this competition';
  end if;

  select id, round_index into v_final_round_id, v_new_index
  from rounds where competition_id = p_competition_id order by round_index desc limit 1;
  if v_final_round_id is null then
    raise exception 'competition has no rounds';
  end if;

  update rounds set round_index = v_new_index + 1 where id = v_final_round_id;
  insert into rounds (competition_id, round_index, name)
  values (p_competition_id, v_new_index, '第 ' || v_new_index || ' 輪 · 新輪次');
end;
$$;
grant execute on function add_round(uuid) to authenticated;

create or replace function remove_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_round_index int;
  v_min_idx int;
  v_max_idx int;
begin
  select competition_id, round_index into v_competition_id, v_round_index
  from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;
  if not can_manage_competition(v_competition_id, 'format') then
    raise exception 'insufficient permission to edit this competition';
  end if;

  select min(round_index), max(round_index) into v_min_idx, v_max_idx
  from rounds where competition_id = v_competition_id;
  if v_round_index = v_min_idx or v_round_index = v_max_idx then
    raise exception '初賽與決賽不可移除';
  end if;

  delete from rounds where id = p_round_id;
end;
$$;
grant execute on function remove_round(uuid) to authenticated;

create or replace function set_round_anonymity(p_round_id uuid, p_is_anonymous boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  select competition_id into v_competition_id from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;
  if not can_manage_competition(v_competition_id, 'format') then
    raise exception 'insufficient permission to edit this competition';
  end if;
  update rounds set is_anonymous = p_is_anonymous where id = p_round_id;
end;
$$;
grant execute on function set_round_anonymity(uuid, boolean) to authenticated;

create or replace function set_all_rounds_anonymity(p_competition_id uuid, p_is_anonymous boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_competition(p_competition_id, 'format') then
    raise exception 'insufficient permission to edit this competition';
  end if;
  update rounds set is_anonymous = p_is_anonymous where competition_id = p_competition_id;
end;
$$;
grant execute on function set_all_rounds_anonymity(uuid, boolean) to authenticated;

create or replace function set_round_schedule_windows(
  p_competition_id uuid,
  p_round_ids uuid[],
  p_submission_opens_at timestamptz,
  p_submission_closes_at timestamptz,
  p_voting_opens_at timestamptz,
  p_voting_closes_at timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_foreign_count int;
begin
  if not can_manage_competition(p_competition_id, 'schedule') then
    raise exception 'insufficient permission to edit this competition''s schedule';
  end if;

  select count(*) into v_foreign_count
  from rounds where id = any(p_round_ids) and competition_id <> p_competition_id;
  if v_foreign_count > 0 then
    raise exception 'round does not belong to this competition';
  end if;

  update rounds
  set submission_opens_at = p_submission_opens_at,
      submission_closes_at = p_submission_closes_at,
      voting_opens_at = p_voting_opens_at,
      voting_closes_at = p_voting_closes_at
  where id = any(p_round_ids) and competition_id = p_competition_id;
end;
$$;
grant execute on function set_round_schedule_windows(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
