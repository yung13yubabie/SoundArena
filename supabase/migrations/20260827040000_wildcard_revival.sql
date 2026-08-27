-- 外卡復活戰(wildcard_revival)——grilling 確認的設計:
-- - 適用單敗淘汰/循環賽/月週期累積制(排除雙敗淘汰,它自己內建敗部復活概念)。
-- - 候選人:僅限「最近一輪被淘汰者」——組織者觸發當下,最近一次確認結果的那一輪,
--   前N名(離晉級線最近)。N 由主辦人自訂。候選名單在開啟投票當下就算好、寫死
--   (wildcard_revival_candidates),不是投票結束時才重算,避免之後幾輪的淘汰結果
--   反過來改變候選資格。排序演算法(循環賽用勝場數、periodic用累積分數、單敗淘汰
--   用場次票數差距)交給呼叫端(TS 層)算好再傳進來,RPC 只驗證每個候選人真的是
--   source_round 淘汰的人,不重算排名——理由跟 finalize_round_results 一樣,避免
--   SQL/TS 兩邊排名算法各自漂移。
-- - 整場比賽限用一次:wildcard_revival_events 對 competition_id 加 unique 限制,
--   在資料庫層面直接保證,不需要額外狀態欄位追蹤「用過了沒」。
-- - 時間窗限制:一旦「source_round 的下一輪」已經產生分組/配對(teams/pools/matches
--   任一張表有資料),就不能再開啟——避免要把復活的人硬塞進已經排好的對戰名單。
--   這個機會過了,主辦人仍可以在比賽後續其他輪次確認結果後再開(只要還沒用過)。
-- - 投票機制沿用 match_votes 已驗證過的 pattern(voter_id+voter_ip 去重、專用表、
--   不開放 authenticated 直接 INSERT,寫入只能走 service_role 的 Server Action)。
-- - 候選人資訊顯示、匿名規則跟隨 source_round 原本的匿名設定(沿用既有的
--   round_identity_revealed() RPC 判斷)。
-- - 候選人不能投給自己(比照 votes 表原本的規則,不是比照 match_votes 那種「參賽者
--   完全不能投這場」——外卡候選人可能有 3 位以上,投給「別的候選人」不算利益衝突)。

create table wildcard_revival_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  source_round_id uuid not null references rounds(id) on delete cascade,
  voting_opens_at timestamptz not null,
  voting_closes_at timestamptz not null,
  winner_registration_id uuid references registrations(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (competition_id)
);

create table wildcard_revival_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references wildcard_revival_events(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  unique (event_id, registration_id)
);

create table wildcard_revival_votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references wildcard_revival_events(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  voter_ip text not null,
  chosen_registration_id uuid not null references registrations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, voter_id),
  unique (event_id, voter_ip)
);

alter table wildcard_revival_events enable row level security;
alter table wildcard_revival_candidates enable row level security;
alter table wildcard_revival_votes enable row level security;

create policy "wildcard_revival_events readable by authenticated" on wildcard_revival_events for select using (auth.role() = 'authenticated');
create policy "wildcard_revival_candidates readable by authenticated" on wildcard_revival_candidates for select using (auth.role() = 'authenticated');
-- wildcard_revival_votes 本身(誰投給誰)不公開,比照 match_votes:只開放自己查自己
-- 投過誰,不開放任何 authenticated INSERT policy,寫入只能走 service_role。
create policy "wildcard_revival_votes readable by self" on wildcard_revival_votes for select using (auth.uid() = voter_id);

create or replace function check_wildcard_revival_vote_validity()
returns trigger language plpgsql as $$
declare
  v_voting_opens_at timestamptz;
  v_voting_closes_at timestamptz;
  v_is_candidate boolean;
  v_chosen_owner uuid;
begin
  select voting_opens_at, voting_closes_at into v_voting_opens_at, v_voting_closes_at
  from wildcard_revival_events where id = new.event_id;
  if v_voting_opens_at is null then
    raise exception 'wildcard revival event % not found', new.event_id;
  end if;
  if now() < v_voting_opens_at then
    raise exception 'wildcard revival voting has not opened';
  end if;
  if now() >= v_voting_closes_at then
    raise exception 'wildcard revival voting has closed';
  end if;

  select exists (
    select 1 from wildcard_revival_candidates where event_id = new.event_id and registration_id = new.chosen_registration_id
  ) into v_is_candidate;
  if not v_is_candidate then
    raise exception 'chosen registration is not a candidate for this wildcard revival event';
  end if;

  select user_id into v_chosen_owner from registrations where id = new.chosen_registration_id;
  if v_chosen_owner = new.voter_id then
    raise exception 'cannot vote for yourself';
  end if;

  return new;
end;
$$;

create trigger wildcard_revival_votes_check_validity
  before insert on wildcard_revival_votes
  for each row execute function check_wildcard_revival_vote_validity();

-- 開啟外卡復活投票——候選名單由呼叫端算好傳進來(見檔案開頭說明),這裡只驗證:
-- 權限、source_round 真的已確認結果、下一輪還沒產生分組/配對、每個候選人真的是
-- source_round 淘汰的人、投票時間窗合理。unique(competition_id) 保證整場只能成功
-- insert 一次,第二次呼叫會直接撞 unique violation。
create or replace function open_wildcard_revival_event(
  p_competition_id uuid,
  p_source_round_id uuid,
  p_candidate_registration_ids uuid[],
  p_voting_opens_at timestamptz,
  p_voting_closes_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_source_round_index int;
  v_source_finalized_at timestamptz;
  v_source_competition_id uuid;
  v_next_round_id uuid;
  v_next_has_pairing boolean;
  v_event_id uuid;
begin
  if not can_manage_competition(p_competition_id, 'review') then
    raise exception 'insufficient permission to open wildcard revival for this competition';
  end if;

  select round_index, results_finalized_at, competition_id
    into v_source_round_index, v_source_finalized_at, v_source_competition_id
  from rounds where id = p_source_round_id;

  if v_source_competition_id is null or v_source_competition_id <> p_competition_id then
    raise exception 'source round does not belong to this competition';
  end if;
  if v_source_finalized_at is null then
    raise exception 'source round has not been finalized yet';
  end if;

  select id into v_next_round_id from rounds
  where competition_id = p_competition_id and round_index = v_source_round_index + 1;

  if v_next_round_id is not null then
    select
      exists (select 1 from teams where round_id = v_next_round_id)
      or exists (select 1 from pools where round_id = v_next_round_id)
      or exists (select 1 from matches where round_id = v_next_round_id)
    into v_next_has_pairing;
    if v_next_has_pairing then
      raise exception 'next round pairing has already been formed, this window has closed';
    end if;
  end if;

  if p_candidate_registration_ids is null or array_length(p_candidate_registration_ids, 1) = 0 then
    raise exception 'no candidates supplied';
  end if;
  if exists (
    select 1 from unnest(p_candidate_registration_ids) as rid
    where not exists (
      select 1 from registrations r
      where r.id = rid and r.competition_id = p_competition_id and r.eliminated_in_round_id = p_source_round_id
    )
  ) then
    raise exception 'candidate list contains a registration not eliminated in the source round';
  end if;

  if p_voting_opens_at is null or p_voting_closes_at is null or p_voting_closes_at <= p_voting_opens_at then
    raise exception 'invalid voting window';
  end if;

  insert into wildcard_revival_events (competition_id, source_round_id, voting_opens_at, voting_closes_at)
  values (p_competition_id, p_source_round_id, p_voting_opens_at, p_voting_closes_at)
  returning id into v_event_id;

  insert into wildcard_revival_candidates (event_id, registration_id)
  select v_event_id, rid from unnest(p_candidate_registration_ids) as rid;

  return v_event_id;
end;
$$;
grant execute on function open_wildcard_revival_event(uuid, uuid, uuid[], timestamptz, timestamptz) to authenticated;

-- 確認外卡復活結果——贏家(得票最高的候選人)由呼叫端算好傳進來(平手偵測在 TS 層,
-- 邏輯跟 single_elimination/double_elimination 的「確認本輪結果」平手擋下同一套),
-- 這裡只驗證權限、投票已截止、還沒確認過、贏家真的是候選人,套用後把這個人的
-- registrations.status 改回 active。
create or replace function resolve_wildcard_revival_event(p_event_id uuid, p_winner_registration_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_voting_closes_at timestamptz;
  v_resolved_at timestamptz;
  v_is_candidate boolean;
begin
  select competition_id, voting_closes_at, resolved_at
    into v_competition_id, v_voting_closes_at, v_resolved_at
  from wildcard_revival_events where id = p_event_id;
  if v_competition_id is null then
    raise exception 'wildcard revival event not found';
  end if;

  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to resolve this wildcard revival event';
  end if;

  if v_resolved_at is not null then
    raise exception 'this wildcard revival event has already been resolved';
  end if;
  if now() < v_voting_closes_at then
    raise exception 'cannot resolve before voting has closed';
  end if;

  select exists (
    select 1 from wildcard_revival_candidates where event_id = p_event_id and registration_id = p_winner_registration_id
  ) into v_is_candidate;
  if not v_is_candidate then
    raise exception 'winner is not a candidate of this event';
  end if;

  update wildcard_revival_events set winner_registration_id = p_winner_registration_id, resolved_at = now() where id = p_event_id;
  update registrations set status = 'active', eliminated_in_round_id = null where id = p_winner_registration_id;
end;
$$;
grant execute on function resolve_wildcard_revival_event(uuid, uuid) to authenticated;
