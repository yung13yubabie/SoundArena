-- 獨立複查點出:很多自由輸入欄位是純 text,沒有長度上限——不是傳統 injection,而是
-- storage/bandwidth/DB bloat 型的 DoS(20 個帳號 x 大 payload 就能灌爆)。這裡補上
-- DB check constraint 當最後一道防線,對應的 Server Action 也會加上相同上限的
-- 提前驗證(給使用者看得懂的錯誤訊息,不要讓請求打到 DB 才被 constraint 擋掉)。

alter table feedback
  add constraint feedback_message_length check (char_length(message) <= 3000);

alter table comments
  add constraint comments_body_length check (char_length(body) <= 2000);

alter table submissions
  add constraint submissions_title_length check (title is null or char_length(title) <= 200),
  add constraint submissions_lyrics_length check (lyrics is null or char_length(lyrics) <= 30000),
  add constraint submissions_suno_share_url_length check (char_length(suno_share_url) <= 2048),
  add constraint submissions_cover_image_url_length check (cover_image_url is null or char_length(cover_image_url) <= 2048),
  add constraint submissions_review_note_length check (review_note is null or char_length(review_note) <= 2000);

alter table registrations
  add constraint registrations_display_name_length check (char_length(display_name) <= 60),
  add constraint registrations_suno_handle_length check (char_length(suno_handle) <= 60),
  add constraint registrations_review_note_length check (review_note is null or char_length(review_note) <= 2000);

alter table profiles
  add constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 60),
  add constraint profiles_bio_length check (bio is null or char_length(bio) <= 800),
  add constraint profiles_social_link_length check (social_link is null or char_length(social_link) <= 2048),
  add constraint profiles_featured_track_url_length check (featured_track_url is null or char_length(featured_track_url) <= 2048);
