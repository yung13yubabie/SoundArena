-- Codex adversarial review 抓到:PlatformAdmin 強制移除有真實投稿的輪次時,
-- submissions.round_id 的 cascade 會把底下投稿(含唯一記載音檔位置的
-- audio_object_key)一起刪掉,但這裡沒有比照 delete_competition()/
-- delete_own_submission()(ADR-0035/DB-08)寫進 audio_pending_deletion 追蹤表——
-- B2 上的音檔會變成永久孤兒,cleanup-audio cron 掃不到任何紀錄可以清。
--
-- 回傳型別從 void 改成 text[](這輪底下所有投稿的 audio_object_key),照這個
-- session 已確立的規則,回傳型別變更要先 drop 再 create。
drop function if exists remove_round(uuid);

create function remove_round(p_round_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
  v_round_index int;
  v_min_idx int;
  v_max_idx int;
  v_submission_count int;
  v_audio_keys text[];
begin
  select competition_id, round_index into v_competition_id, v_round_index
  from rounds where id = p_round_id;
  if v_competition_id is null then
    raise exception 'round not found';
  end if;
  if not can_manage_competition(v_competition_id, 'format') and not is_platform_admin() then
    raise exception 'insufficient permission to edit this competition';
  end if;

  select min(round_index), max(round_index) into v_min_idx, v_max_idx
  from rounds where competition_id = v_competition_id;
  if v_round_index = v_min_idx or v_round_index = v_max_idx then
    raise exception '初賽與決賽不可移除';
  end if;

  if not is_platform_admin() then
    select count(*) into v_submission_count from submissions where round_id = p_round_id;
    if v_submission_count > 0 then
      raise exception 'this round already has real submissions — ask a platform admin to remove it';
    end if;
  end if;

  select array_agg(s.audio_object_key) into v_audio_keys
  from submissions s
  where s.round_id = p_round_id and s.audio_object_key is not null;

  if v_audio_keys is not null then
    insert into audio_pending_deletion (object_key, reason)
    select unnest(v_audio_keys), 'round_delete';
  end if;

  delete from rounds where id = p_round_id;

  return coalesce(v_audio_keys, array[]::text[]);
end;
$$;
grant execute on function remove_round(uuid) to authenticated;
