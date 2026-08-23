-- grilling 確認的設計轉向:「每隊固定人數(team_size)」換成「主辦人填這輪要分幾組
-- (group_count,上限5)」,系統把還在比賽中的人均勻分配到這幾組,除不盡的餘數打散
-- 到前面幾組(例如14人分3組→5、5、4),不是固定每組N人、最後一組收剩下的零頭。
create or replace function form_team_groups_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_competition_name text;
  v_round_name text;
  v_round_index int;
  v_min_idx int;
  v_registration_closes_at timestamptz;
  v_group_count int;
  v_is_team_round boolean;
  v_prev_round_id uuid;
  v_prev_finalized_at timestamptz;
  v_trigger_met boolean := false;
  v_reg_ids uuid[];
  v_shuffled uuid[];
  v_total int;
  v_base_size int;
  v_remainder int;
  v_team_id uuid;
  v_team_name text;
  v_g int;
  v_this_size int;
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

  select coalesce((rfb.config->>'group_count')::int, 2) into v_group_count
  from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
  where rfb.round_id = p_round_id and fb.key = 'team';
  if v_group_count is null or v_group_count < 1 then v_group_count := 2; end if;
  if v_group_count > 5 then v_group_count := 5; end if;

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

  v_total := array_length(v_shuffled, 1);
  if v_group_count > v_total then v_group_count := v_total; end if;
  v_base_size := v_total / v_group_count;
  v_remainder := v_total % v_group_count;

  v_i := 1;
  for v_g in 1..v_group_count loop
    v_this_size := v_base_size + (case when v_g <= v_remainder then 1 else 0 end);
    v_team_name := '第 ' || v_g || ' 隊';
    insert into teams (round_id, name) values (p_round_id, v_team_name) returning id into v_team_id;

    insert into team_members (team_id, round_id, registration_id)
    select v_team_id, p_round_id, v_shuffled[j]
    from generate_series(v_i, v_i + v_this_size - 1) as j;

    v_i := v_i + v_this_size;
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
