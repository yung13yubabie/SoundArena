-- 團隊分組(組隊賽亂數分組)——grilling 確認的設計:
-- - 隊伍綁在「輪次」上,不是整場比賽——同一個人在不同的團隊輪次可能被分到不同隊伍
-- - 觸發時機:初選(第一輪)是報名截止;非初選是「前一輪確認結果」(見上一支
--   migration 的 results_finalized_at,不能用 voting_closes_at,那個時間點淘汰名單
--   可能還沒真的定案)
-- - 每隊人數存在該輪 'team' 積木的 round_format_blocks.config(既有的 jsonb 欄位,
--   themed_round 已經在用同一種存法),沒填預設 3 人
-- - Vercel Hobby 方案 cron 一天只能跑一次,不夠即時——這裡不用排程,改成「造訪相關
--   頁面時順便檢查」的 lazy trigger 模式(跟這個 session 已經用過的 B2 清理/通知
--   發送同一種「立即嘗試+cron 兜底」精神,只是這裡完全沒有天然的使用者動作可以
--   掛,所以整個機制都是 lazy check)

create table teams (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  primary key (team_id, registration_id),
  unique (round_id, registration_id)
);

alter table teams enable row level security;
alter table team_members enable row level security;

create policy "teams readable by review-permission holders" on teams for select using (
  exists (select 1 from rounds r where r.id = teams.round_id and can_manage_competition(r.competition_id, 'review'))
);
create policy "team_members readable by review-permission holders" on team_members for select using (
  can_manage_competition((select r.competition_id from rounds r where r.id = team_members.round_id), 'review')
);

-- ============================================================================
-- 核心分組邏輯——同時滿足冪等(已經分過就直接 return,不會重複分)跟自我驗證
-- (所有前提條件都在函式內部檢查,呼叫者不需要、也不應該有特殊權限,任何人造訪
-- 頁面觸發這個檢查都是安全的,頂多是「條件不成立就什麼都不做」)。
-- ============================================================================
create or replace function form_team_groups_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_competition_name text;
  v_round_name text;
  v_round_index int;
  v_min_idx int;
  v_registration_closes_at timestamptz;
  v_team_size int;
  v_is_team_round boolean;
  v_prev_round_id uuid;
  v_prev_finalized_at timestamptz;
  v_trigger_met boolean := false;
  v_reg_ids uuid[];
  v_shuffled uuid[];
  v_team_id uuid;
  v_team_name text;
  v_i int;
  v_member record;
  v_teammates text;
  v_channel notification_channel;
  v_provider text;
begin
  select r.competition_id, r.name, r.round_index, c.registration_closes_at, c.name
    into v_competition_id, v_round_name, v_round_index, v_registration_closes_at, v_competition_name
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;
  if v_competition_id is null then return; end if;

  if exists (select 1 from teams where round_id = p_round_id) then return; end if;

  select
    exists (
      select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
      where rfb.round_id = p_round_id and fb.key = 'team'
    ) and exists (
      select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
      where rfb.round_id = p_round_id and fb.key = 'lottery'
    )
  into v_is_team_round;
  if not v_is_team_round then return; end if;

  select coalesce((rfb.config->>'team_size')::int, 3) into v_team_size
  from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
  where rfb.round_id = p_round_id and fb.key = 'team';
  if v_team_size is null or v_team_size < 1 then v_team_size := 3; end if;

  select min(round_index) into v_min_idx from rounds where competition_id = v_competition_id;

  if v_round_index = v_min_idx then
    v_trigger_met := v_registration_closes_at is not null and now() >= v_registration_closes_at;
  else
    select id into v_prev_round_id from rounds
    where competition_id = v_competition_id and round_index < v_round_index
    order by round_index desc limit 1;
    if v_prev_round_id is not null then
      select results_finalized_at into v_prev_finalized_at from rounds where id = v_prev_round_id;
      v_trigger_met := v_prev_finalized_at is not null;
    end if;
  end if;
  if not v_trigger_met then return; end if;

  select array_agg(id) into v_reg_ids from registrations where competition_id = v_competition_id and status = 'active';
  if v_reg_ids is null or array_length(v_reg_ids, 1) = 0 then return; end if;

  select array_agg(x) into v_shuffled from (select unnest(v_reg_ids) as x order by random()) t;

  v_i := 1;
  while v_i <= array_length(v_shuffled, 1) loop
    v_team_name := '第 ' || ceil(v_i::numeric / v_team_size) || ' 隊';
    insert into teams (round_id, name) values (p_round_id, v_team_name) returning id into v_team_id;

    insert into team_members (team_id, round_id, registration_id)
    select v_team_id, p_round_id, v_shuffled[j]
    from generate_series(v_i, least(v_i + v_team_size - 1, array_length(v_shuffled, 1))) as j;

    v_i := v_i + v_team_size;
  end loop;

  -- 通知每個被分組的參賽者——直接 insert,不透過 create_notification_event()。
  -- 那支 RPC 的權限模型假設呼叫者是本人或對這場比賽有 review 權限,但這裡的呼叫者
  -- 可能只是剛好造訪頁面、順便觸發這次檢查的任何一個人,跟被通知的對象完全無關。
  for v_member in
    select tm.registration_id, r.user_id, tm.team_id, t.name as team_name
    from team_members tm
    join teams t on t.id = tm.team_id
    join registrations r on r.id = tm.registration_id
    where tm.round_id = p_round_id
  loop
    select string_agg(p.display_name, '、') into v_teammates
    from team_members tm2
    join registrations r2 on r2.id = tm2.registration_id
    join profiles p on p.id = r2.user_id
    where tm2.team_id = v_member.team_id and tm2.registration_id <> v_member.registration_id;

    select raw_app_meta_data ->> 'provider' into v_provider from auth.users where id = v_member.user_id;
    if v_provider = 'google' then
      v_channel := 'email';
    elsif v_provider = 'discord' then
      v_channel := 'discord';
    else
      continue;
    end if;

    insert into notification_events (user_id, competition_id, event_type, title, body, channel, status, created_by)
    values (
      v_member.user_id, v_competition_id, 'team_assigned', '隊伍分組結果',
      '「' || v_competition_name || '」的「' || v_round_name || '」已經分好隊,你在「' || v_member.team_name || '」。' ||
      case when v_teammates is not null then '隊友:' || v_teammates || '。' else '' end,
      v_channel, 'pending', v_member.user_id
    );
  end loop;
end;
$$;

grant execute on function form_team_groups_for_round(uuid) to authenticated;

-- 一次檢查一場比賽底下所有輪次——lazy check 呼叫端只需要知道 competition_id,
-- 不用自己列出每個輪次逐一檢查。
create or replace function check_and_form_pending_teams(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round_id uuid;
begin
  for v_round_id in select id from rounds where competition_id = p_competition_id order by round_index loop
    perform form_team_groups_for_round(v_round_id);
  end loop;
end;
$$;
grant execute on function check_and_form_pending_teams(uuid) to authenticated;

-- 主辦人手動換組——後台可以操作換組。
create or replace function swap_team_member(p_registration_id uuid, p_new_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round_id uuid;
  v_new_team_round_id uuid;
  v_competition_id uuid;
  v_competition_name text;
  v_round_name text;
  v_user_id uuid;
  v_team_name text;
  v_teammates text;
  v_channel notification_channel;
  v_provider text;
begin
  select tm.round_id into v_round_id from team_members tm where tm.registration_id = p_registration_id;
  if v_round_id is null then
    raise exception 'this registration is not currently assigned to any team';
  end if;

  select round_id into v_new_team_round_id from teams where id = p_new_team_id;
  if v_new_team_round_id is null or v_new_team_round_id <> v_round_id then
    raise exception 'target team does not belong to the same round';
  end if;

  select r.competition_id, c.name, r.name into v_competition_id, v_competition_name, v_round_name
  from rounds r join competitions c on c.id = r.competition_id where r.id = v_round_id;

  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to change team assignments for this competition';
  end if;

  update team_members set team_id = p_new_team_id where registration_id = p_registration_id and round_id = v_round_id;

  select reg.user_id, t.name into v_user_id, v_team_name
  from registrations reg, teams t where reg.id = p_registration_id and t.id = p_new_team_id;

  select string_agg(p.display_name, '、') into v_teammates
  from team_members tm2 join registrations r2 on r2.id = tm2.registration_id join profiles p on p.id = r2.user_id
  where tm2.team_id = p_new_team_id and tm2.registration_id <> p_registration_id;

  select raw_app_meta_data ->> 'provider' into v_provider from auth.users where id = v_user_id;
  if v_provider = 'google' then
    v_channel := 'email';
  elsif v_provider = 'discord' then
    v_channel := 'discord';
  else
    return;
  end if;

  insert into notification_events (user_id, competition_id, event_type, title, body, channel, status, created_by)
  values (
    v_user_id, v_competition_id, 'team_assigned', '隊伍異動通知',
    '「' || v_competition_name || '」的「' || v_round_name || '」隊伍異動,你現在在「' || v_team_name || '」。' ||
    case when v_teammates is not null then '隊友:' || v_teammates || '。' else '' end,
    v_channel, 'pending', auth.uid()
  );
end;
$$;
grant execute on function swap_team_member(uuid, uuid) to authenticated;

alter table notification_events
  drop constraint notification_events_event_type_allowed,
  add constraint notification_events_event_type_allowed
    check (event_type in ('registration_confirmed', 'submission_confirmed', 'organizer_message', 'team_assigned'));
