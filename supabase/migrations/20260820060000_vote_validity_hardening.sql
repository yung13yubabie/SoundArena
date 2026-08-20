-- 資安複查發現 check_vote_validity() 只檢查「作品存在、round_id 對得上、不能投自己」,
-- 完全沒檢查:①現在是不是真的在投票時間窗內、②這個作品是不是真的審核通過、③投稿者
-- 現在是不是還是 active(沒被淘汰)。UI 上「投票已結束」只是前端不顯示投票按鈕,
-- 直接打 API 完全不受影響。這裡補齊三項檢查。
--
-- voter_ip 的偽造問題(攻擊者繞過 Next.js 直接打 PostgREST,自己指定 voter_ip)
-- 這輪刻意沒有修——Postgres/PostgREST 這一層沒有可靠、不能被同一招繞過的方式取得
-- 真實用戶端 IP(不管是讀 column 還是讀 request header,直接打 API 的人一樣能偽造)。
-- 要真的解決需要換成不直接暴露 PostgREST、由 Edge Function/Next.js Route Handler
-- 作為唯一入口的架構,這是比較大的改動,先誠實記錄成已知限制,不假裝修好了。
-- unique(round_id, voter_id) 這個真正硬的防重複依然完全有效,voter_id 來自
-- auth.uid(),不是使用者能指定的欄位。

create or replace function check_vote_validity()
returns trigger language plpgsql as $$
declare
  v_round rounds%rowtype;
  v_submission_status submission_status;
  v_registration_status participant_status;
  v_submission_owner uuid;
begin
  select s.status, reg.user_id, reg.status
    into v_submission_status, v_submission_owner, v_registration_status
  from submissions s
  join registrations reg on reg.id = s.registration_id
  where s.id = new.submission_id and s.round_id = new.round_id;

  if v_submission_owner is null then
    raise exception 'submission % not found in round %', new.submission_id, new.round_id;
  end if;

  if v_submission_owner = new.voter_id then
    raise exception 'cannot vote for your own submission';
  end if;

  if v_submission_status <> 'approved' then
    raise exception 'submission is not approved for voting';
  end if;

  if v_registration_status <> 'active' then
    raise exception 'this contestant has been eliminated, their submission is no longer votable';
  end if;

  select * into v_round from rounds where id = new.round_id;
  if v_round.id is null then
    raise exception 'round % not found', new.round_id;
  end if;
  if v_round.voting_opens_at is null or now() < v_round.voting_opens_at then
    raise exception 'voting has not opened for this round yet';
  end if;
  if v_round.voting_closes_at is null or now() > v_round.voting_closes_at then
    raise exception 'voting has closed for this round';
  end if;

  return new;
end;
$$;
