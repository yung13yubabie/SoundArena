-- 投票/評分這條線需要的 RLS——votes 跟 submission_scores 兩張表 RLS 已開啟但一直留白
-- (只有 service_role 能寫),現在要讓一般登入使用者的 session 直接投票、讓 Organizer
-- 直接輸入評分,所以要補上對應 policy。

-- 投票:自己可以投(voter_id = auth.uid()),自己可以查自己投過誰(判斷「已投票」狀態用),
-- 該比賽的 Organizer 可以查全部(算票數用)。不開放參賽者互相看彼此的投票紀錄。
create policy "votes insertable by self" on votes for insert with check (auth.uid() = voter_id);
create policy "votes readable by self" on votes for select using (auth.uid() = voter_id);
create policy "votes readable by competition organizer" on votes for select using (
  exists (
    select 1 from rounds r
    join competitions c on c.id = r.competition_id
    where r.id = votes.round_id and c.organizer_id = auth.uid()
  )
);

-- 評分:只有該比賽的 Organizer 能寫入/讀取(「魔王加給」「外部投票」目前都是 Organizer
-- 手動輸入,見 SPEC.md 第8節——沒有獨立的評審邀請機制,同一場比賽=同一位 Organizer)。
create policy "submission_scores manageable by competition organizer" on submission_scores for all using (
  exists (
    select 1 from submissions s
    join rounds r on r.id = s.round_id
    join competitions c on c.id = r.competition_id
    where s.id = submission_scores.submission_id and c.organizer_id = auth.uid()
  )
) with check (
  exists (
    select 1 from submissions s
    join rounds r on r.id = s.round_id
    join competitions c on c.id = r.competition_id
    where s.id = submission_scores.submission_id and c.organizer_id = auth.uid()
  )
);
