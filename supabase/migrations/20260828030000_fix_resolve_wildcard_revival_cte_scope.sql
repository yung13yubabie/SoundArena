-- 修 20260828010000 裡 resolve_wildcard_revival_event() 的一個真實 SQL bug:
-- with vote_counts as (...) 這個 CTE 的作用域只限於它所在的那一個陳述式,後面
-- 分開的 select ... into ... from vote_counts 是另一個獨立陳述式,引用不到
-- 已經結束的 CTE,PoC 實測直接噴 "relation vote_counts does not exist"。改成
-- 把 max/top_count/winner 全部收進同一個 CTE-scoped 陳述式裡一次算完。
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
  select
    (select max(votes) from vote_counts),
    (select count(*) from vote_counts where votes = (select max(votes) from vote_counts)),
    (select registration_id from vote_counts where votes = (select max(votes) from vote_counts) limit 1)
  into v_max_votes, v_top_count, v_computed_winner;

  if v_top_count > 1 then
    raise exception 'tie for highest votes, cannot resolve automatically';
  end if;

  if v_computed_winner is distinct from p_winner_registration_id then
    raise exception 'supplied winner does not match the candidate with the most votes';
  end if;

  update wildcard_revival_events set winner_registration_id = p_winner_registration_id, resolved_at = now() where id = p_event_id;
  update registrations set status = 'active', eliminated_in_round_id = null where id = p_winner_registration_id;
end;
$$;
