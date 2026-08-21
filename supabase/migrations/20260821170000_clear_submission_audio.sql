-- 保留政策(使用者原本的決定):前三名保留音檔,其餘參賽者淘汰後移除音檔,只留
-- Suno 連結;而且要等整場比賽完全結束才統一清,不要逐輪清。判斷「前三名是誰」
-- 需要重算加權計分(lib/ranking.ts 那套邏輯),在 SQL 裡重寫一份風險是兩邊定義
-- 分岔——所以排名判斷留在 Next.js(呼叫既有的 getRoundResults()),這支 RPC
-- 只負責「清掉指定這一筆投稿的 audio_object_key」,並且做權限檢查。

create or replace function clear_submission_audio(p_submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  select c.id into v_competition_id
  from submissions s
  join rounds r on r.id = s.round_id
  join competitions c on c.id = r.competition_id
  where s.id = p_submission_id;

  if v_competition_id is null then
    raise exception 'submission not found';
  end if;
  if not can_manage_competition(v_competition_id, 'format') then
    raise exception 'insufficient permission to clean up this submission';
  end if;

  update submissions set audio_object_key = null where id = p_submission_id;
end;
$$;

grant execute on function clear_submission_audio(uuid) to authenticated;
