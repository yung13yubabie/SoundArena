-- 暫時診斷用:驗證 create_competition_full() 真的有交易原子性,不是只是「看起來」
-- 一次呼叫。故意在建立 rounds 之後、寫 scoring_rule 之前 raise exception,呼叫端
-- 應該看到「連 competition 本身都不存在」——證明前面已成功的 insert 也被整個
-- transaction 回滾,不是只有失敗那一步被擋下來。驗證完就會被下一個 migration 移除。

create or replace function diag_create_competition_full_fail_after_rounds(p_name text, p_slug text, p_default_anonymous boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_competition_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not is_non_revoked_self() then
    raise exception 'insufficient permission to create a competition';
  end if;

  insert into competitions (organizer_id, name, slug, is_public)
  values (v_user_id, trim(p_name), p_slug, true)
  returning id into v_competition_id;

  perform create_initial_rounds(v_competition_id, p_default_anonymous);

  raise exception 'diag: deliberate failure after rounds created, before scoring_rule';
end;
$$;
grant execute on function diag_create_competition_full_fail_after_rounds(text, text, boolean) to authenticated;
