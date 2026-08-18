-- 上一個 migration(080000)的 CASE 表達式沒有把字串字面值轉型成 notification_delivery_status
-- enum,實測時 42804 報錯——Postgres 在 CREATE FUNCTION 階段沒抓到,呼叫時才真的報錯。
-- 這裡直接 replace 成正確版本,不修改前一個 migration 檔案本身(那個檔案已經 push 過)。

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
