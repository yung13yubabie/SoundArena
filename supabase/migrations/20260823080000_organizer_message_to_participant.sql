-- SA-012 追加需求:主辦人(或 review 權限協作者)可以在後台直接對特定參賽者發
-- Discord/Email 訊息,不用透過我(平台管理員)轉達。
--
-- ADR-0015(20260821140000)刻意把 create_notification_event() 改成呼叫端不能傳
-- 任意 title/body,只能傳 event_type + resource_id,文案完全由 server 端固定產生,
-- 防止內容被污染成釣魚管道。這裡的需求剛好相反——主辦人就是要傳自訂內容,所以
-- 開一支獨立的 RPC,不去弱化既有那支的安全設計,兩者分開維護。範圍收得夠窄:
-- 只有這場比賽有 'review' 權限的人(主辦人或協作者,判斷邏輯跟審核投稿身份完全
-- 一樣),對象只能是這場比賽底下真實存在的報名者,不能對任意 user_id 發送。
alter table notification_events
  drop constraint notification_events_event_type_allowed,
  add constraint notification_events_event_type_allowed
    check (event_type in ('registration_confirmed', 'submission_confirmed', 'organizer_message'));

create or replace function create_organizer_message_event(p_registration_id uuid, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_target_user_id uuid;
  v_notifications_enabled boolean;
  v_channel notification_channel;
  v_provider text;
  v_event_id uuid;
  v_trimmed text;
begin
  v_trimmed := trim(p_message);
  if v_trimmed = '' then
    raise exception 'message cannot be empty';
  end if;
  if char_length(v_trimmed) > 1000 then
    raise exception 'message too long';
  end if;

  select competition_id, user_id, notifications_enabled
    into v_competition_id, v_target_user_id, v_notifications_enabled
  from registrations where id = p_registration_id;
  if v_competition_id is null then
    raise exception 'registration not found';
  end if;

  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to message participants of this competition';
  end if;

  -- 參賽者已經主動取消這場比賽的通知訂閱(SPEC.md 第6節)——主辦人手動發訊息
  -- 不能繞過這個選擇,明確報錯讓主辦人知道,而不是靜默假裝送出去了。
  if v_notifications_enabled is distinct from true then
    raise exception 'this participant has disabled notifications for this competition';
  end if;

  perform pg_advisory_xact_lock(hashtext('notification_event:' || auth.uid()::text)::bigint);
  if exists (
    select 1 from notification_events
    where created_by = auth.uid() and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'please wait a moment before creating more notification events';
  end if;

  select raw_app_meta_data ->> 'provider' into v_provider from auth.users where id = v_target_user_id;
  if v_provider = 'google' then
    v_channel := 'email';
  elsif v_provider = 'discord' then
    v_channel := 'discord';
  else
    raise exception 'this participant has no supported notification channel';
  end if;

  insert into notification_events (user_id, competition_id, event_type, title, body, channel, status, created_by)
  values (v_target_user_id, v_competition_id, 'organizer_message', '來自主辦人的訊息', v_trimmed, v_channel, 'pending', auth.uid())
  returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function create_organizer_message_event(uuid, text) to authenticated;
