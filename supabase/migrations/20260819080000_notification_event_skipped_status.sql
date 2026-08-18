-- 上一版 create_notification_event() 遇到「已取消訂閱」或「登入方式不支援通知管道」
-- 時直接 return,完全不留痕跡——但 CONTEXT.md 的 NotificationEvent 狀態機寫的是
-- Pending/Sent/Failed/Skipped 四態,「已取消訂閱」該對應到 Skipped,不是悄悄消失。
-- 這裡改成兩種情況都真的寫一筆 status='skipped' 的紀錄,行為才跟文件一致,也方便之後
-- debug「為什麼沒收到通知」——查得到 skipped 紀錄就知道是自己關掉的還是管道不支援。

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
    -- 不支援的登入方式沒有對應的 channel 可寫——email/discord 是這張表僅有的兩個
    -- enum 值,沒有第三種可以標記「未知管道」,只能整筆不建立。這是唯一一種真的
    -- 完全不留痕跡的情況,跟「已取消訂閱」(下面用 skipped 記錄下來)不同。
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
