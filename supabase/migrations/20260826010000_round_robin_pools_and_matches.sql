-- 循環賽(round_robin)+ 抽籤分組(lottery)——grilling 確認的設計:
-- - 「抽籤分組」補上真的行為:主辦人填「每池人數上限」,系統依人數自動算出要分
--   幾池、均勻分配(沿用組隊賽已驗證過的均分打散演算法),觸發時機完全比照組隊賽
--   (報名截止/前一輪確認結果 lazy check)。
-- - pools/pool_members 跟 teams/team_members 語意不同(競賽對手池 vs 合作提交單位),
--   刻意分開建表,不共用。
-- - 循環賽在每個池內生成所有兩兩配對的場次(matches),各自獨立開放投票
--   (match_votes,不動現有 votes 表——votes 是 unique(round_id, voter_id) 一輪一票,
--   循環賽一輪內有好幾場配對需要能投好幾票)。
-- - 5:5 平票算平局,雙方各得 0.5 勝;最終排名依「勝場數」(含平局的 0.5)接現有的
--   elimination_percent 自動淘汰機制。

create table pools (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table pool_members (
  pool_id uuid not null references pools(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  primary key (pool_id, registration_id),
  unique (round_id, registration_id)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  pool_id uuid not null references pools(id) on delete cascade,
  registration_a_id uuid not null references registrations(id) on delete cascade,
  registration_b_id uuid not null references registrations(id) on delete cascade,
  winner_registration_id uuid references registrations(id) on delete set null,
  created_at timestamptz not null default now(),
  check (registration_a_id <> registration_b_id)
);

create table match_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  voter_ip inet not null,
  chosen_registration_id uuid not null references registrations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (match_id, voter_id),
  unique (match_id, voter_ip)
);

alter table pools enable row level security;
alter table pool_members enable row level security;
alter table matches enable row level security;
alter table match_votes enable row level security;

create policy "pools readable by review-permission holders" on pools for select using (
  exists (select 1 from rounds r where r.id = pools.round_id and can_manage_competition(r.competition_id, 'review'))
);
create policy "pool_members readable by review-permission holders" on pool_members for select using (
  can_manage_competition((select r.competition_id from rounds r where r.id = pool_members.round_id), 'review')
);

-- matches 要能被投票者讀取(需要知道對戰雙方才能投票),不像 pools/pool_members
-- 只給主辦人看——比照現有 submissions/rounds 對登入使用者開放的可讀範圍。
create policy "matches readable by authenticated" on matches for select using (auth.role() = 'authenticated');

-- match_votes 本身(誰投給誰)不公開,只有 service_role/security definer function 內部
-- 讀取用來計票——不開放任何直接 SELECT/INSERT policy,比照 votes 表同一套保護個別
-- 投票紀錄的模式(votes 的 INSERT 對 authenticated 全面收回,voter_ip 只有 Next.js
-- 層量得到真實值,寫入一定要走 service_role,見 web/src/app/vote/actions.ts 的
-- castVote() 註解)。這裡沒有另外寫 revoke,因為根本沒開放任何 INSERT policy,
-- RLS 預設就是全擋。

create or replace function check_match_vote_validity()
returns trigger language plpgsql as $$
declare
  v_reg_a uuid;
  v_reg_b uuid;
begin
  select registration_a_id, registration_b_id into v_reg_a, v_reg_b from matches where id = new.match_id;
  if v_reg_a is null then
    raise exception 'match % not found', new.match_id;
  end if;

  if new.chosen_registration_id <> v_reg_a and new.chosen_registration_id <> v_reg_b then
    raise exception 'chosen registration is not part of this match';
  end if;

  if exists (
    select 1 from registrations r where r.id in (v_reg_a, v_reg_b) and r.user_id = new.voter_id
  ) then
    raise exception 'cannot vote on your own match';
  end if;

  return new;
end;
$$;

create trigger match_votes_check_validity
  before insert on match_votes
  for each row execute function check_match_vote_validity();

create or replace function form_lottery_pools_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_competition_name text;
  v_round_name text;
  v_round_index int;
  v_min_idx int;
  v_registration_closes_at timestamptz;
  v_pool_size int;
  v_pool_count int;
  v_is_lottery_round boolean;
  v_prev_round_id uuid;
  v_prev_finalized_at timestamptz;
  v_trigger_met boolean := false;
  v_reg_ids uuid[];
  v_shuffled uuid[];
  v_total int;
  v_base_size int;
  v_remainder int;
  v_pool_id uuid;
  v_pool_name text;
  v_p int;
  v_this_size int;
  v_i int;
  v_member record;
  v_poolmates text;
  v_channel notification_channel;
  v_provider text;
begin
  select r.competition_id, r.name, r.round_index, c.registration_closes_at, c.name
    into v_competition_id, v_round_name, v_round_index, v_registration_closes_at, v_competition_name
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;
  if v_competition_id is null then return; end if;

  if exists (select 1 from pools where round_id = p_round_id) then return; end if;

  select exists (
    select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
    where rfb.round_id = p_round_id and fb.key = 'lottery'
  ) into v_is_lottery_round;
  if not v_is_lottery_round then return; end if;

  select coalesce((rfb.config->>'pool_size')::int, 5) into v_pool_size
  from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
  where rfb.round_id = p_round_id and fb.key = 'lottery';
  if v_pool_size is null or v_pool_size < 2 then v_pool_size := 5; end if;

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
  v_pool_count := ceil(v_total::numeric / v_pool_size);
  if v_pool_count < 1 then v_pool_count := 1; end if;
  v_base_size := v_total / v_pool_count;
  v_remainder := v_total % v_pool_count;

  v_i := 1;
  for v_p in 1..v_pool_count loop
    v_this_size := v_base_size + (case when v_p <= v_remainder then 1 else 0 end);
    v_pool_name := '第 ' || v_p || ' 池';
    insert into pools (round_id, name) values (p_round_id, v_pool_name) returning id into v_pool_id;

    insert into pool_members (pool_id, round_id, registration_id)
    select v_pool_id, p_round_id, v_shuffled[j]
    from generate_series(v_i, v_i + v_this_size - 1) as j;

    v_i := v_i + v_this_size;
  end loop;

  for v_member in
    select pm.registration_id, r.user_id, pm.pool_id, p.name as pool_name
    from pool_members pm
    join pools p on p.id = pm.pool_id
    join registrations r on r.id = pm.registration_id
    where pm.round_id = p_round_id
  loop
    select string_agg(pr.display_name, '、') into v_poolmates
    from pool_members pm2
    join registrations r2 on r2.id = pm2.registration_id
    join profiles pr on pr.id = r2.user_id
    where pm2.pool_id = v_member.pool_id and pm2.registration_id <> v_member.registration_id;

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
      v_member.user_id, v_competition_id, 'team_assigned', '循環賽分組結果',
      '「' || v_competition_name || '」的「' || v_round_name || '」已經分好對戰組,你在「' || v_member.pool_name || '」。' ||
      case when v_poolmates is not null then '同組對手:' || v_poolmates || '。' else '' end,
      v_channel, 'pending', v_member.user_id
    );
  end loop;
end;
$$;
grant execute on function form_lottery_pools_for_round(uuid) to authenticated;

create or replace function check_and_form_pending_pools(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round_id uuid;
begin
  for v_round_id in select id from rounds where competition_id = p_competition_id order by round_index loop
    perform form_lottery_pools_for_round(v_round_id);
  end loop;
end;
$$;
grant execute on function check_and_form_pending_pools(uuid) to authenticated;

-- 池分好之後,如果這輪同時選了「循環賽」,在每個池內生成所有兩兩配對的場次——
-- 獨立於分組本身,分組(lottery)可以未來單獨給別的玩法用,不強制一定要接循環賽。
create or replace function generate_round_robin_matches_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_is_round_robin boolean;
  v_pool record;
  v_members uuid[];
  v_a int;
  v_b int;
begin
  if exists (select 1 from matches where round_id = p_round_id) then return; end if;

  select exists (
    select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
    where rfb.round_id = p_round_id and fb.key = 'round_robin'
  ) into v_is_round_robin;
  if not v_is_round_robin then return; end if;

  for v_pool in select id from pools where round_id = p_round_id loop
    select array_agg(registration_id order by registration_id) into v_members from pool_members where pool_id = v_pool.id;
    if v_members is null or array_length(v_members, 1) < 2 then continue; end if;

    for v_a in 1..array_length(v_members, 1) loop
      for v_b in (v_a + 1)..array_length(v_members, 1) loop
        insert into matches (round_id, pool_id, registration_a_id, registration_b_id)
        values (p_round_id, v_pool.id, v_members[v_a], v_members[v_b]);
      end loop;
    end loop;
  end loop;
end;
$$;
grant execute on function generate_round_robin_matches_for_round(uuid) to authenticated;

create or replace function check_and_form_pending_matches(p_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round_id uuid;
begin
  for v_round_id in select id from rounds where competition_id = p_competition_id order by round_index loop
    perform generate_round_robin_matches_for_round(v_round_id);
  end loop;
end;
$$;
grant execute on function check_and_form_pending_matches(uuid) to authenticated;
