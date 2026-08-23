-- SA-005 通知送出功能:「記錄事件」這端(create_notification_event())本來就完整
-- 運作中,缺的只是真的送出去的 sender。要做到「事件建立當下立即嘗試發送、失敗才
-- 靠每日 cron 補送」,呼叫端需要拿到新建那筆 notification_events 的 id——回傳型別
-- 從 void 改成 uuid,照這個 session 已確立的規則,回傳型別變更要先 drop 再 create。
drop function if exists create_notification_event(uuid, uuid, text, uuid);

create function create_notification_event(
  p_user_id uuid,
  p_competition_id uuid,
  p_event_type text,
  p_resource_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_is_self boolean;
  v_provider text;
  v_channel notification_channel;
  v_notifications_enabled boolean;
  v_title text;
  v_body text;
  v_competition_name text;
  v_round_name text;
  v_submission_title text;
  v_event_id uuid;
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

  select name into v_competition_name from competitions where id = p_competition_id;

  if p_event_type = 'registration_confirmed' then
    if not exists (
      select 1 from registrations
      where id = p_resource_id and user_id = p_user_id and competition_id = p_competition_id
    ) then
      raise exception 'resource does not match this event';
    end if;
    v_title := '報名成功';
    v_body := '已收到你對「' || coalesce(v_competition_name, '這場比賽') || '」的報名，等主辦人審核。';

  elsif p_event_type = 'submission_confirmed' then
    select s.title, r.name into v_submission_title, v_round_name
    from submissions s
    join rounds r on r.id = s.round_id
    join registrations reg on reg.id = s.registration_id
    where s.id = p_resource_id and reg.user_id = p_user_id and reg.competition_id = p_competition_id;

    if v_round_name is null then
      raise exception 'resource does not match this event';
    end if;
    v_title := '投稿已送出';
    v_body := '「' || coalesce(v_submission_title, '這首作品') || '」已送出到「' || coalesce(v_round_name, '本輪') || '」，狀態轉為待人工審核。';

  else
    raise exception 'unknown event_type: %', p_event_type;
  end if;

  select raw_app_meta_data ->> 'provider' into v_provider from auth.users where id = p_user_id;

  if v_provider = 'google' then
    v_channel := 'email';
  elsif v_provider = 'discord' then
    v_channel := 'discord';
  else
    return null;
  end if;

  insert into notification_events (user_id, competition_id, event_type, title, body, channel, status, created_by)
  values (
    p_user_id, p_competition_id, p_event_type, v_title, v_body, v_channel,
    case
      when v_notifications_enabled is distinct from true then 'skipped'::notification_delivery_status
      else 'pending'::notification_delivery_status
    end,
    auth.uid()
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function create_notification_event(uuid, uuid, text, uuid) to authenticated;
