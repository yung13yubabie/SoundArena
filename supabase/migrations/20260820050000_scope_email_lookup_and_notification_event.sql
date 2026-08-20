-- 資安複查真實 PoC 確認兩個洞:
--
-- 1. find_profile_by_email(p_email) 對 authenticated 全面開放,內部沒有任何權限檢查,
--    回傳 profile UUID/display_name/avatar_url——row 存在 vs 不存在本身就是 email
--    是否註冊過 SoundArena 的 oracle,跟「沒有回 email 所以不算 email existence query」
--    這個假設不成立(真的測過:任何登入帳號,不需要跟目標有任何比賽關係,就能查)。
--    修法:加一個 p_competition_id 參數,函式一開始就檢查呼叫者對這場比賽有沒有 invite
--    權限,沒有直接 raise——只有正在邀請協作者的主辦人/協作者才能查,不是任何登入者。
--
-- 2. create_notification_event() 對 authenticated 全面開放,裡面完全沒檢查
--    auth.uid() = p_user_id,也沒檢查呼叫者是不是那場比賽的主辦人/協作者——任何登入者
--    只要知道別人的 UUID + 一場他有報名的比賽 UUID,就能用任意 title/body/event_type
--    幫別人建立一筆通知事件(真的測過會成功寫進資料庫)。寄信/Discord 私訊都還沒接上時
--    頂多是垃圾資料,一旦接上 Resend 就會直接變成內容可控的釣魚管道。
--    修法:只允許兩種呼叫者——本人幫自己建(auth.uid() = p_user_id,對應報名/投稿成功
--    這種「使用者自己觸發、通知對象就是自己」的既有用法),或者該比賽的主辦人/協作者
--    (對應之後要做的「晉級/淘汰/公布結果」這類主辦人觸發的通知)。

drop function if exists find_profile_by_email(text);

create or replace function find_profile_by_email(p_competition_id uuid, p_email text)
returns table(id uuid, display_name text, avatar_url text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_competition(p_competition_id, 'invite') then
    raise exception 'insufficient permission to look up profiles for this competition';
  end if;

  return query
    select p.id, p.display_name, p.avatar_url
    from profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower(trim(p_email))
    limit 1;
end;
$$;

grant execute on function find_profile_by_email(uuid, text) to authenticated;

create or replace function create_notification_event(
  p_user_id uuid,
  p_competition_id uuid,
  p_event_type text,
  p_title text,
  p_body text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_provider text;
  v_channel notification_channel;
  v_notifications_enabled boolean;
begin
  if auth.uid() <> p_user_id and not can_manage_competition(p_competition_id, 'review') then
    raise exception 'insufficient permission to create a notification event for this user';
  end if;

  select r.notifications_enabled into v_notifications_enabled
  from registrations r
  where r.user_id = p_user_id and r.competition_id = p_competition_id
  limit 1;

  select raw_app_meta_data ->> 'provider' into v_provider from auth.users where id = p_user_id;

  if v_provider = 'google' then
    v_channel := 'email';
  elsif v_provider = 'discord' then
    v_channel := 'discord';
  else
    return;
  end if;

  insert into notification_events (user_id, competition_id, event_type, title, body, channel, status)
  values (
    p_user_id, p_competition_id, p_event_type, p_title, p_body, v_channel,
    case
      when v_notifications_enabled is distinct from true then 'skipped'::notification_delivery_status
      else 'pending'::notification_delivery_status
    end
  );
end;
$$;
