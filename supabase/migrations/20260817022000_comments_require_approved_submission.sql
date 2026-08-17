-- 補一個測試時發現的漏洞:comments 的 RLS 只檢查「比賽是不是公開」,沒檢查投稿本身
-- 有沒有通過審核——理論上可以留言給一筆還在「待審核」甚至「已退回」的投稿。使用者的
-- 場景是「觀看他人作品並留言」,指的是已經上架的作品,不是尚未過審的草稿,這裡補上
-- status = 'approved' 的條件。

drop policy "comments readable when competition public" on comments;
drop policy "comments insertable by anyone when competition public" on comments;

create policy "comments readable when competition public" on comments for select using (
  exists (
    select 1 from submissions s
    join rounds r on r.id = s.round_id
    join competitions c on c.id = r.competition_id
    where s.id = comments.submission_id and c.is_public = true and s.status = 'approved'
  )
);

create policy "comments insertable by anyone when competition public" on comments for insert with check (
  auth.uid() = commenter_id
  and endorsement_percent = 0
  and exists (
    select 1 from submissions s
    join rounds r on r.id = s.round_id
    join competitions c on c.id = r.competition_id
    where s.id = comments.submission_id and c.is_public = true and s.status = 'approved'
  )
);
