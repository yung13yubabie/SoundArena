-- ADR-0006:AnonymityMode 從 Competition 層級三選一改成 Round 層級布林值。
-- competitions.anonymity_mode 保留(現有 CreateCompetitionForm/CompetitionMetaForm
-- 還在寫入),但從這裡開始不再被任何邏輯讀取,是 vestigial 欄位——下一輪做「全部套用 +
-- 個別調整」UI 時要跟這個欄位、跟舊的三選一下拉選單一起拔掉。

alter table rounds add column is_anonymous boolean not null default true;

-- 揭露規則簡化成單一條件,不再需要判斷「是不是決賽」:
-- 這輪標記匿名 → 投票截止(voting_closes_at 已過)才揭露;沒標記匿名 → 一開始就公開。
create or replace function round_identity_revealed(p_round_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_is_anonymous boolean;
  v_voting_closes_at timestamptz;
  v_round_id_check uuid;
begin
  if p_round_id is null then
    return false;
  end if;

  select r.id, r.is_anonymous, r.voting_closes_at
    into v_round_id_check, v_is_anonymous, v_voting_closes_at
  from rounds r
  where r.id = p_round_id;

  if v_round_id_check is null then
    return false;
  end if;

  if not v_is_anonymous then
    return true;
  end if;

  return v_voting_closes_at is not null and v_voting_closes_at <= now();
end;
$$;
