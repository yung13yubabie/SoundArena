-- 獨立複查抓到一個真的漏洞:20260820100000 那版 rate limit trigger 是單純
-- 「SELECT EXISTS 有沒有最近的紀錄 → 沒有就放行 INSERT」,在併發請求下是 TOCTOU race——
-- 多個 transaction 可能同時看到「還沒有最近紀錄」,全部通過檢查。
--
-- 用真實併發 PoC 證實(見對話記錄,20 併發拿到 1 筆通過,50 併發拿到 5 筆,100 併發拿到
-- 6 筆——理論上不管併發多少都應該只有 1 筆通過)。
--
-- 修法採用使用者建議的方向:pg_advisory_xact_lock,讓同一個使用者的併發請求在
-- 「檢查 + 寫入」這段關鍵區間內強制序列化——第二個請求會卡在拿鎖,直到第一個請求
-- 的整個 transaction 結束(commit 或 rollback)才能繼續,這時候它的 EXISTS 查詢
-- 才會真的看到第一個請求剛寫入的那一筆。鎖的 key 用 hashtext('<table>:' || user_id)
-- 算,同一個使用者對同一張表的請求才會互相排隊,不同使用者之間不受影響
-- (雜湊碰撞机率極低,就算真的撞到,頂多是不同使用者之間多等一點點,不影響正確性)。

create or replace function enforce_feedback_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('feedback:' || new.user_id::text)::bigint);
  if exists (
    select 1 from feedback
    where user_id = new.user_id and created_at > now() - interval '20 seconds'
  ) then
    raise exception 'please wait a moment before sending more feedback';
  end if;
  return new;
end;
$$;

create or replace function enforce_comment_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('comment:' || new.commenter_id::text)::bigint);
  if exists (
    select 1 from comments
    where commenter_id = new.commenter_id and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'please wait a moment before commenting again';
  end if;
  return new;
end;
$$;
