-- Codex 對抗式審查(codex:codex-rescue)找到、逐項對照原始碼+真實資料庫驗證後確認
-- 為真的 4 個問題的修復。修復前的驗證方式:Finding 1/3/4 直接讀對照原始碼確認邏輯
-- 缺口;Finding 2 用真實 anon key 登入的 session client(不是 service_role)實測
-- RLS,確認一般投票者真的讀不到 allow_public_playback=false 的投稿,驗證用的測試
-- 資料(1個比賽、3個使用者)已在驗證腳本的 finally 區塊清除,沒有殘留正式資料庫。

-- ============================================================
-- Finding 1(高):match_votes 的驗證 trigger 沒有檢查投票視窗——對照舊的 votes
-- 表 trigger(20260820060000_vote_validity_hardening.sql)有檢查
-- voting_opens_at/voting_closes_at,match_votes 從一開始就漏了,導致循環賽/單敗
-- 淘汰/雙敗淘汰的配對投票不受投票視窗約束,任何時間都能投。
-- ============================================================
create or replace function check_match_vote_validity()
returns trigger language plpgsql as $$
declare
  v_reg_a uuid;
  v_reg_b uuid;
  v_round_id uuid;
  v_voting_opens_at timestamptz;
  v_voting_closes_at timestamptz;
begin
  select m.registration_a_id, m.registration_b_id, m.round_id
    into v_reg_a, v_reg_b, v_round_id
  from matches m where m.id = new.match_id;
  if v_reg_a is null then
    raise exception 'match % not found', new.match_id;
  end if;

  select r.voting_opens_at, r.voting_closes_at into v_voting_opens_at, v_voting_closes_at
  from rounds r where r.id = v_round_id;
  if v_voting_opens_at is null or now() < v_voting_opens_at then
    raise exception 'voting has not opened for this round yet';
  end if;
  if v_voting_closes_at is null or now() > v_voting_closes_at then
    raise exception 'voting has closed for this round';
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

-- ============================================================
-- Finding 2(高,但是既有投票機制原本就有的根本缺口,不是這幾批新引入的):一般
-- 投票者用自己的 session client 讀 submissions 時,RLS 只放行「readable when
-- public」(allow_public_playback=true)/自己的投稿/主辦人——真實測過,投稿表單
-- allowPublicPlayback 預設 false,一般投票者完全讀不到別人的投稿內容。
-- 修法:比照現有 judge_submissions_for_round()/round_identity_revealed() 的模式,
-- 新增一個 security definer RPC 只回傳投票必要的安全欄位,不擴大 submissions
-- 本身的 table RLS(避免連 suno_share_url 這種可能洩漏身份的欄位被放寬)。只在
-- 「比賽公開 + 這輪投票視窗開放中」才回傳,投票視窗外(含尚未開始/已截止)一律
-- 回傳空集合——投票結束後的瀏覽是 /results 頁既有的 get_round_scores() 等 RPC
-- 的責任,不歸這支管。
-- ============================================================
create or replace function get_votable_submissions(p_round_id uuid)
returns table (id uuid, title text, registration_id uuid, user_id uuid, suno_share_url text)
language plpgsql security definer set search_path = public as $$
declare
  v_is_public boolean;
  v_voting_opens_at timestamptz;
  v_voting_closes_at timestamptz;
begin
  select c.is_public, r.voting_opens_at, r.voting_closes_at
    into v_is_public, v_voting_opens_at, v_voting_closes_at
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;

  if v_is_public is null or not v_is_public then
    return;
  end if;
  if v_voting_opens_at is null or now() < v_voting_opens_at or v_voting_closes_at is null or now() >= v_voting_closes_at then
    return;
  end if;

  return query
    select s.id, s.title, s.registration_id, r.user_id, s.suno_share_url
    from submissions s
    join registrations r on r.id = s.registration_id
    where s.round_id = p_round_id and s.status = 'approved';
end;
$$;
grant execute on function get_votable_submissions(uuid) to authenticated;

-- ============================================================
-- Finding 3(高):resolve_wildcard_revival_event() 只驗證權限/時程/候選人資格,
-- 沒有驗證傳進來的贏家真的是得票最高的人——直接違背 grilling 當初選定的「開放
-- 觀眾投票決定,不是主辦人手動指定」設計。改成 RPC 自己算票數,平手或跟呼叫端
-- 傳的不一致都拒絕,不再信任呼叫端算好的贏家。
-- ============================================================
create or replace function resolve_wildcard_revival_event(p_event_id uuid, p_winner_registration_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_voting_closes_at timestamptz;
  v_resolved_at timestamptz;
  v_is_candidate boolean;
  v_computed_winner uuid;
  v_max_votes int;
  v_top_count int;
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

  with vote_counts as (
    select c.registration_id, count(v.id) as votes
    from wildcard_revival_candidates c
    left join wildcard_revival_votes v on v.event_id = c.event_id and v.chosen_registration_id = c.registration_id
    where c.event_id = p_event_id
    group by c.registration_id
  )
  select max(votes) into v_max_votes from vote_counts;

  select count(*) into v_top_count from vote_counts where votes = v_max_votes;
  if v_top_count > 1 then
    raise exception 'tie for highest votes, cannot resolve automatically';
  end if;

  select registration_id into v_computed_winner from vote_counts where votes = v_max_votes;
  if v_computed_winner is distinct from p_winner_registration_id then
    raise exception 'supplied winner does not match the candidate with the most votes';
  end if;

  update wildcard_revival_events set winner_registration_id = p_winner_registration_id, resolved_at = now() where id = p_event_id;
  update registrations set status = 'active', eliminated_in_round_id = null where id = p_winner_registration_id;
end;
$$;

-- ============================================================
-- Finding 4(中):generate_double_elimination_matches_for_round() 的敗場數查詢
-- 只用 competition_id 篩選對戰紀錄,沒有限定「只算 double_elimination 輪次的
-- 場次」——如果同一場比賽前面輪次是循環賽/單敗淘汰,後面才切雙敗淘汰,前面
-- 輪次的輸贏會被誤算進雙敗淘汰的敗場數。補上 round_format_blocks/format_blocks
-- 的 exists 過濾,只算真的掛 double_elimination 積木的輪次。
-- ============================================================
create or replace function generate_double_elimination_matches_for_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_round_index int;
  v_min_idx int;
  v_registration_closes_at timestamptz;
  v_is_double_elim boolean;
  v_prev_round_id uuid;
  v_prev_finalized_at timestamptz;
  v_trigger_met boolean := false;
  v_zero_loss_ids uuid[];
  v_one_loss_ids uuid[];
  v_shuffled uuid[];
  v_total int;
  v_i int;
begin
  select r.competition_id, r.round_index, c.registration_closes_at
    into v_competition_id, v_round_index, v_registration_closes_at
  from rounds r join competitions c on c.id = r.competition_id
  where r.id = p_round_id;
  if v_competition_id is null then return; end if;

  if exists (select 1 from matches where round_id = p_round_id) then return; end if;

  select exists (
    select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
    where rfb.round_id = p_round_id and fb.key = 'double_elimination'
  ) into v_is_double_elim;
  if not v_is_double_elim then return; end if;

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

  with loss_counts as (
    select reg.id as registration_id,
      (
        select count(*) from matches m
        join rounds mr on mr.id = m.round_id
        where mr.competition_id = v_competition_id
          and exists (
            select 1 from round_format_blocks rfb join format_blocks fb on fb.id = rfb.format_block_id
            where rfb.round_id = mr.id and fb.key = 'double_elimination'
          )
          and m.winner_registration_id is not null
          and (m.registration_a_id = reg.id or m.registration_b_id = reg.id)
          and m.winner_registration_id <> reg.id
      ) as losses
    from registrations reg
    where reg.competition_id = v_competition_id and reg.status = 'active'
  )
  select
    array_agg(registration_id) filter (where losses = 0),
    array_agg(registration_id) filter (where losses = 1)
  into v_zero_loss_ids, v_one_loss_ids
  from loss_counts;

  if v_zero_loss_ids is not null and array_length(v_zero_loss_ids, 1) = 1
     and v_one_loss_ids is not null and array_length(v_one_loss_ids, 1) = 1 then
    insert into matches (round_id, pool_id, registration_a_id, registration_b_id, bracket)
    values (p_round_id, null, v_zero_loss_ids[1], v_one_loss_ids[1], 'final');
    return;
  end if;

  if v_zero_loss_ids is not null and array_length(v_zero_loss_ids, 1) >= 2 then
    select array_agg(x) into v_shuffled from (select unnest(v_zero_loss_ids) as x order by random()) t;
    v_total := array_length(v_shuffled, 1);
    v_i := 1;
    while v_i + 1 <= v_total loop
      insert into matches (round_id, pool_id, registration_a_id, registration_b_id, bracket)
      values (p_round_id, null, v_shuffled[v_i], v_shuffled[v_i + 1], 'winners');
      v_i := v_i + 2;
    end loop;
  end if;

  if v_one_loss_ids is not null and array_length(v_one_loss_ids, 1) >= 2 then
    select array_agg(x) into v_shuffled from (select unnest(v_one_loss_ids) as x order by random()) t;
    v_total := array_length(v_shuffled, 1);
    v_i := 1;
    while v_i + 1 <= v_total loop
      insert into matches (round_id, pool_id, registration_a_id, registration_b_id, bracket)
      values (p_round_id, null, v_shuffled[v_i], v_shuffled[v_i + 1], 'losers');
      v_i := v_i + 2;
    end loop;
  end if;
end;
$$;
