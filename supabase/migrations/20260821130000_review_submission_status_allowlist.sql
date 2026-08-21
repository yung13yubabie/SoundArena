-- 獨立複查抓到:review_submission() 的 p_status 參數型別是完整的 submission_status
-- enum(draft/identity_checking/identity_matched/identity_mismatched/pending_review/
-- approved/rejected),但這支 RPC 的用途只是「審核通過或退回」,只該接受
-- approved/rejected/pending_review 三種。有 'review' 權限的人繞過 UI,理論上能把
-- 一筆投稿的狀態設成其他四種列舉值,這些狀態不是這支 function 的職責範圍。

create or replace function review_submission(p_submission_id uuid, p_status submission_status, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_competition_id uuid;
begin
  if p_status not in ('approved', 'rejected', 'pending_review') then
    raise exception 'review_submission only accepts approved, rejected, or pending_review';
  end if;

  select c.id into v_competition_id
  from submissions s
  join rounds r on r.id = s.round_id
  join competitions c on c.id = r.competition_id
  where s.id = p_submission_id;

  if v_competition_id is null then
    raise exception 'submission not found';
  end if;
  if not can_manage_competition(v_competition_id, 'review') then
    raise exception 'insufficient permission to review this submission';
  end if;

  update submissions
  set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  where id = p_submission_id;
end;
$$;
