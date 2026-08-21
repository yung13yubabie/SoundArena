-- 獨立複查抓到:投稿流程會呼叫 verifySunoSharer() 兩次——使用者離開網址欄位時
-- 前端先呼叫一次(preflight),真正送出投稿時 submitEntry() 為了安全又會在
-- 伺服器端重新呼叫一次(防止繞過 preflight 直接呼叫 submitEntry 帶假身份)。
-- 這兩次呼叫共用同一個「每 2 秒一次」的 rate limit,如果使用者 preflight 完
-- 馬上按送出,兩次呼叫距離可能不到 2 秒,合法的送出流程會被自己的防濫用機制
-- 誤傷,而且會顯示成「Suno 分享連結驗證失敗」,使用者會誤以為連結本身有問題。
--
-- 修法:cooldown 的判斷單位從「這個使用者」改成「這個使用者 + 這個 code」——
-- 同一個 code 在短時間內重複驗證不受限(preflight 跟送出時驗的是同一個連結,
-- 也就是同一個 code),但快速切換成不同 code 依然會被擋下,對「拿這支 API
-- 當免費代理狂查一堆不同連結」的濫用防護沒有減弱。

drop table if exists suno_verify_attempts;

create table suno_verify_attempts (
  user_id uuid not null references profiles(id) on delete cascade,
  code text not null,
  last_attempt_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table suno_verify_attempts enable row level security;
-- 沒有對 authenticated 開任何 policy——完全只透過下面這支 SECURITY DEFINER RPC 存取。

create or replace function check_suno_verify_rate_limit(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_recent_other_code boolean;
begin
  if auth.uid() is null then
    raise exception 'must be logged in';
  end if;

  perform pg_advisory_xact_lock(hashtext('suno_verify:' || auth.uid()::text)::bigint);

  select exists (
    select 1 from suno_verify_attempts
    where user_id = auth.uid() and code <> p_code and last_attempt_at > now() - interval '2 seconds'
  ) into v_recent_other_code;

  if v_recent_other_code then
    raise exception 'please wait a moment before verifying again';
  end if;

  insert into suno_verify_attempts (user_id, code, last_attempt_at) values (auth.uid(), p_code, now())
  on conflict (user_id, code) do update set last_attempt_at = now();
end;
$$;

grant execute on function check_suno_verify_rate_limit(text) to authenticated;
