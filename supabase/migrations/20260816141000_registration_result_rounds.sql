-- /u/[id] 公開檔案的「參賽紀錄」要接真實名次,需要知道「這筆公開報名紀錄,在哪些已公開結果
-- 的輪次裡有投稿」——submissions 的公開讀取policy綁在「使用者自己選不選擇公開試聽」這個
-- 完全不同的開關上,不能拿來找「這場比賽這個人到底投稿過哪些輪次」。同樣用 SECURITY DEFINER
-- function 集中處理,只回傳輪次/投稿的 id 本身(不含分數),分數/名次交給既有的
-- get_round_submissions + get_round_scores 算,不重複實作排名邏輯。

create or replace function get_registration_result_rounds(p_registration_id uuid)
returns table(round_id uuid, round_name text, round_index int, submission_id uuid)
language sql security definer set search_path = public as $$
  select r.id, r.name, r.round_index, s.id
  from submissions s
  join rounds r on r.id = s.round_id
  join competitions c on c.id = r.competition_id
  join registrations reg on reg.id = s.registration_id
  where s.registration_id = p_registration_id
    and s.status = 'approved'
    and reg.is_public = true
    and c.is_public = true
    and r.voting_closes_at is not null
    and r.voting_closes_at <= now()
  order by r.round_index;
$$;

grant execute on function get_registration_result_rounds(uuid) to anon, authenticated;
