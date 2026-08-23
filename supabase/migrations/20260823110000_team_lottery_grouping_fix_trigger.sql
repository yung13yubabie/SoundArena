-- 修正上一支 migration 的錯誤假設:當初以為一輪可以同時掛「隊伍賽」(team)跟
-- 「抽籤分組」(lottery)兩個積木,但實際 admin/format 的 UI(AdminFormatClient.tsx
-- 的「分組方式」)跟其背後的 toggleFormatBlock() action 對 grouping 這個 category
-- 是單選——選了 team 就會把 lottery 從該輪刪掉,反之亦然,兩者不可能同時存在。
-- 照原本的判斷式(要求兩個積木都存在),form_team_groups_for_round() 在真實 UI
-- 底下永遠不會觸發,整個功能會變成死碼。
--
-- 修正:「隊伍賽」本身就代表需要分組,而抽籤是目前唯一實作的分組機制,所以判斷式
-- 改成只檢查 'team' 積木存在。'lottery' 積木本身是給「個人賽但用抽籤分組(如分
-- 種子/分場次)」這種未來可能的獨立玩法用的,跟隊伍分組無關,不該混在一起判斷。
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

  select exists (
    select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
    where rfb.round_id = p_round_id and fb.key = 'team'
  ) into v_is_team_round;
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
