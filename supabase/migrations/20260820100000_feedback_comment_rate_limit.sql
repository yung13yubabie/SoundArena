-- ADR-0011 item 3(P2):Feedback / Comment 沒有任何 rate limit,腳本可以無限灌。
-- 用 BEFORE INSERT trigger 擋「同一個人在冷卻時間內重複送出」,不影響正常使用節奏。
--
-- 兩支 trigger function 都刻意標成 SECURITY DEFINER——這輪稍早修 check_vote_validity()
-- 時踩過一次坑:trigger 預設是 SECURITY INVOKER,內部查詢會被呼叫者自己的 RLS
-- 擋住看不到資料(feedback 目前只有 platform admin 能 SELECT,一般使用者對自己過去
-- 送出的 feedback 完全沒有讀取權限),導致「查有沒有最近送過」永遠查到 0 筆,
-- rate limit 形同虛設。這裡直接用 SECURITY DEFINER 避開同一類問題,不重蹈覆轍。

create or replace function enforce_feedback_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from feedback
    where user_id = new.user_id and created_at > now() - interval '20 seconds'
  ) then
    raise exception 'please wait a moment before sending more feedback';
  end if;
  return new;
end;
$$;

create trigger feedback_rate_limit
  before insert on feedback
  for each row execute function enforce_feedback_rate_limit();

create or replace function enforce_comment_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from comments
    where commenter_id = new.commenter_id and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'please wait a moment before commenting again';
  end if;
  return new;
end;
$$;

create trigger comment_rate_limit
  before insert on comments
  for each row execute function enforce_comment_rate_limit();
