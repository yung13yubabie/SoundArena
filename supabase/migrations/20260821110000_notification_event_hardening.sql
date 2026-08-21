-- 獨立複查抓到:create_notification_event() 上一輪只補了「誰能呼叫」的權限檢查
-- (呼叫者必須是本人,或對這場比賽有 'review' 權限),完全沒管「內容」——
-- event_type/title/body 三個欄位呼叫端可以填任意字串、任意長度,而且有 'review'
-- 權限的人可以對任何 p_user_id 建立事件,不需要對方真的是這場比賽的參賽者。
-- 現在 Resend/Discord 還沒真正接上,危害主要是灌爆 notification_events 表;
-- 但接上之後會直接升級成郵件/Discord 額度濫用或內容偽造。
--
-- 這裡先做三件成本低、立即生效的加固,完整的「event_type enum + 由 server 端
-- 依 resource id 產生 title/body,不再信任呼叫端傳入」屬於比較大的重構,列成
-- Resend 上線前的 blocker,記在 ADR 裡,這裡不做。
--   1. event_type 限制成目前實際會用到的兩種值,body/title 補長度上限。
--   2. 用 'review' 權限幫別人建立事件時,對方必須是這場比賽真正的參賽者
--      (有對應的 registrations row),不能對任意 user_id 亂發。
--   3. 補上跟 feedback/comments 同一套 advisory lock rate limit,避免自我灌爆。

-- 加 created_by 記錄真正呼叫這支 RPC 的人(不一定等於 user_id——'review' 權限的人
-- 可以幫參賽者建立事件)。沒有這欄,rate limit 沒辦法正確地「限制呼叫者」,只能
-- 限制「事件的對象」,幫別人建事件的濫用完全不受限。
alter table notification_events add column created_by uuid references profiles(id) on delete set null;
update notification_events set created_by = user_id where created_by is null;
alter table notification_events alter column created_by set not null;

alter table notification_events
  add constraint notification_events_event_type_allowed
    check (event_type in ('registration_confirmed', 'submission_confirmed')),
  add constraint notification_events_title_length check (char_length(title) <= 200),
  add constraint notification_events_body_length check (char_length(body) <= 2000);

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
  v_is_self boolean;
begin
  v_is_self := auth.uid() = p_user_id;

  if not v_is_self and not can_manage_competition(p_competition_id, 'review') then
    raise exception 'insufficient permission to create a notification event for this user';
  end if;

  perform pg_advisory_xact_lock(hashtext('notification_event:' || auth.uid()::text)::bigint);
  if exists (
    select 1 from notification_events
    where created_by = auth.uid() and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'please wait a moment before creating more notification events';
  end if;

  select r.notifications_enabled into v_notifications_enabled
  from registrations r
  where r.user_id = p_user_id and r.competition_id = p_competition_id
  limit 1;

  if not v_is_self and v_notifications_enabled is null then
    raise exception 'target user is not a participant of this competition';
  end if;

  select raw_app_meta_data ->> 'provider' into v_provider from auth.users where id = p_user_id;

  if v_provider = 'google' then
    v_channel := 'email';
  elsif v_provider = 'discord' then
    v_channel := 'discord';
  else
    return;
  end if;

  insert into notification_events (user_id, competition_id, event_type, title, body, channel, status, created_by)
  values (
    p_user_id, p_competition_id, p_event_type, p_title, p_body, v_channel,
    case
      when v_notifications_enabled is distinct from true then 'skipped'::notification_delivery_status
      else 'pending'::notification_delivery_status
    end,
    auth.uid()
  );
end;
$$;
