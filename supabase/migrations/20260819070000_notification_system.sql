-- ADR-0009(見 CONTEXT.md「Subscription」「NotificationEvent」詞條)。使用者這輪確認:
-- 沒有已備妥 API key 的寄信服務商,先不做真的寄信;Discord 用私訊不用頻道。
-- 這輪先把「訂閱 + 事件記錄」這個誠實的架構建好——notification_events.status 預設
-- 'pending' 就是最誠實的呈現方式(系統知道該發什麼、發給誰,只是還沒有 sender 真的送出),
-- 不用另外裝一個 console.log 假裝已經在寄信。等寄信服務商/Discord webhook 接上,只要新增一支
-- background worker 把 pending 的事件實際送出、status 改成 sent/failed,架構完全相容不用重構。

-- 訂閱(附著在 Registration 上,不是獨立表——SPEC.md 第6節:「報名才是訂閱動作」)
alter table registrations add column notifications_enabled boolean not null default true;

create type notification_channel as enum ('email', 'discord');
create type notification_delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

create table notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  competition_id uuid not null references competitions(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  channel notification_channel not null,
  status notification_delivery_status not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index idx_notification_events_user on notification_events(user_id);
create index idx_notification_events_status on notification_events(status);

alter table notification_events enable row level security;

create policy "notification_events readable by self" on notification_events for select using (auth.uid() = user_id);

-- ============================================================================
-- 建立通知事件——所有觸發點都走這個 function,不直接 INSERT notification_events
-- (一般 authenticated 角色也確實沒有 INSERT policy,只能透過這個 SECURITY DEFINER 路徑)。
-- ============================================================================
-- 管道由登入方式決定(SPEC.md 第6節):Google 登入 → email;Discord 登入 → 私訊。
-- 其餘登入方式(目前只有 email/password,是這輪測試帳號用的,不是真實使用者管道)
-- 或使用者已取消訂閱該場比賽時,不建立事件——不是報錯,單純跳過。
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

  if v_notifications_enabled is distinct from true then
    return;
  end if;

  select raw_app_meta_data ->> 'provider' into v_provider from auth.users where id = p_user_id;

  if v_provider = 'google' then
    v_channel := 'email';
  elsif v_provider = 'discord' then
    v_channel := 'discord';
  else
    return;
  end if;

  insert into notification_events (user_id, competition_id, event_type, title, body, channel)
  values (p_user_id, p_competition_id, p_event_type, p_title, p_body, v_channel);
end;
$$;

grant execute on function create_notification_event(uuid, uuid, text, text, text) to authenticated;

-- ============================================================================
-- 取消/恢復訂閱——比照既有的 set_registration_public 模式,本人專用
-- ============================================================================
create or replace function set_registration_notifications(p_registration_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update registrations
  set notifications_enabled = p_enabled
  where id = p_registration_id and user_id = auth.uid();

  if not found then
    raise exception 'registration not found or not yours';
  end if;
end;
$$;

grant execute on function set_registration_notifications(uuid, boolean) to authenticated;
