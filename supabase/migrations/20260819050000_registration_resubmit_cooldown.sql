-- ADR-0008 記錄過「這輪沒有做節流機制,之後真的觀察到濫用再加」——使用者這輪明確要求現在就加,
-- 補上重新送出的冷卻時間,防止「比賽蟑螂」瘋狂連續送出騷擾審核隊列。
--
-- 用獨立的 last_resubmitted_at 欄位,不共用 registrations.updated_at——updated_at 也會被
-- Organizer 的 review_registration(退回/通過)刷新,共用會把「主辦剛退回」跟「本人重新送出」
-- 兩個不同角色的動作混在一起計算冷卻,導致主辦一退回,本人反而立刻被冷卻擋住,不合理。

alter table registrations add column last_resubmitted_at timestamptz;

create or replace function resubmit_registration(
  p_registration_id uuid,
  p_display_name text,
  p_suno_handle text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_review_status registration_review_status;
  v_last_resubmitted_at timestamptz;
  v_cooldown interval := interval '10 minutes';
  v_wait_seconds int;
begin
  select user_id, review_status, last_resubmitted_at
    into v_user_id, v_review_status, v_last_resubmitted_at
  from registrations where id = p_registration_id;

  if v_user_id is null then
    raise exception 'registration not found';
  end if;
  if v_user_id != auth.uid() then
    raise exception 'not your registration';
  end if;
  if v_review_status != 'rejected' then
    raise exception 'only a rejected registration can be resubmitted';
  end if;
  if trim(p_display_name) = '' or trim(p_suno_handle) = '' then
    raise exception 'display_name and suno_handle are required';
  end if;

  if v_last_resubmitted_at is not null and v_last_resubmitted_at > now() - v_cooldown then
    v_wait_seconds := ceil(extract(epoch from (v_last_resubmitted_at + v_cooldown - now())));
    raise exception 'resubmit cooldown: wait % seconds', v_wait_seconds;
  end if;

  update registrations
  set
    display_name = trim(p_display_name),
    suno_handle = trim(p_suno_handle),
    review_status = 'pending_review',
    review_note = null,
    last_resubmitted_at = now()
  where id = p_registration_id;
end;
$$;
