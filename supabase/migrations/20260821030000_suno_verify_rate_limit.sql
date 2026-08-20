-- 獨立複查點出:verifySunoSharer() 這支 Server Action 完全沒有 auth check、沒有
-- rate limit,任何人(甚至未登入)都可以透過它讓我們的伺服器狂打 Suno 的
-- studio-api-prod.suno.com,把我們的站當成打 Suno API 的免費代理,消耗 Vercel
-- function 額度、甚至可能害我們的站被 Suno 反過來限速。
--
-- 用一張小表 + advisory lock(跟 rate-limit trigger 同一套手法)做「每個使用者最多
-- 2 秒呼叫一次」的限制。目標端點是外部 API,不是我們自己的資料表,所以沒辦法直接
-- 用 BEFORE INSERT trigger,改成一支獨立 RPC,在真正呼叫 Suno 之前先檢查。

create table suno_verify_attempts (
  user_id uuid primary key references profiles(id) on delete cascade,
  last_attempt_at timestamptz not null default now()
);

alter table suno_verify_attempts enable row level security;
-- 沒有對 authenticated 開任何 policy——完全只透過下面這支 SECURITY DEFINER RPC 存取。

create or replace function check_suno_verify_rate_limit()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_last timestamptz;
begin
  if auth.uid() is null then
    raise exception 'must be logged in';
  end if;

  perform pg_advisory_xact_lock(hashtext('suno_verify:' || auth.uid()::text)::bigint);

  select last_attempt_at into v_last from suno_verify_attempts where user_id = auth.uid();
  if v_last is not null and v_last > now() - interval '2 seconds' then
    raise exception 'please wait a moment before verifying again';
  end if;

  insert into suno_verify_attempts (user_id, last_attempt_at) values (auth.uid(), now())
  on conflict (user_id) do update set last_attempt_at = now();
end;
$$;

grant execute on function check_suno_verify_rate_limit() to authenticated;
