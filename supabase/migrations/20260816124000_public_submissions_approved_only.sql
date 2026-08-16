-- 公開檔案頁的「投稿作品」不該連退回(rejected)的投稿都秀出來——那是審核沒過的東西,
-- 不是使用者想展示的作品。原本的 policy 只看 allow_public_playback + registration.is_public,
-- 沒管審核狀態,這裡補上 status = 'approved'。

drop policy "submissions readable when public" on submissions;

create policy "submissions readable when public" on submissions for select using (
  allow_public_playback = true
  and status = 'approved'
  and exists (select 1 from registrations r where r.id = submissions.registration_id and r.is_public = true)
);
