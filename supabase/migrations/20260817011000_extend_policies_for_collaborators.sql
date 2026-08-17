-- 把既有「僅 Organizer」的 policy 換成 can_manage_competition(),讓有對應權限的
-- Collaborator 也能做同一件事。drop 再 create——Postgres 沒有 ALTER POLICY 改
-- USING/WITH CHECK 內容的語法,只能整條換掉。

-- ============================================================================
-- competitions:基本資料在 /admin/format 改、時程在 /admin/schedule 改,
-- 兩張表的同一批欄位其實是兩個頁面在寫,RLS 是列級不是欄位級,沒辦法只開放
-- 「這欄」給 format、「那欄」給 schedule,所以兩種權限都能通過。
-- ============================================================================

drop policy "competitions updatable by organizer" on competitions;
create policy "competitions updatable by organizer or collaborator" on competitions for update using (
  can_manage_competition(id, 'format') or can_manage_competition(id, 'schedule')
) with check (
  can_manage_competition(id, 'format') or can_manage_competition(id, 'schedule')
);

-- Collaborator 要看得到這場比賽才能做任何事——原本只有 Organizer 能读自己的
-- 非公開比賽,這裡補一條給 Collaborator。
create policy "own competitions readable by collaborator" on competitions for select using (
  is_competition_collaborator(id)
);

-- ============================================================================
-- rounds / scoring_rules / score_items / round_format_blocks:全部是 /admin/format
-- 的範圍,rounds 的時程欄位另外被 /admin/schedule 寫,所以 rounds 也接受 schedule 權限。
-- ============================================================================

drop policy "rounds writable by organizer" on rounds;
create policy "rounds writable by organizer or collaborator" on rounds for all using (
  can_manage_competition(competition_id, 'format') or can_manage_competition(competition_id, 'schedule')
) with check (
  can_manage_competition(competition_id, 'format') or can_manage_competition(competition_id, 'schedule')
);

drop policy "scoring_rules writable by organizer" on scoring_rules;
create policy "scoring_rules writable by organizer or collaborator" on scoring_rules for all using (
  can_manage_competition(competition_id, 'format')
) with check (
  can_manage_competition(competition_id, 'format')
);

drop policy "score_items writable by organizer" on score_items;
create policy "score_items writable by organizer or collaborator" on score_items for all using (
  exists (
    select 1 from scoring_rules sr
    where sr.id = score_items.scoring_rule_id and can_manage_competition(sr.competition_id, 'format')
  )
) with check (
  exists (
    select 1 from scoring_rules sr
    where sr.id = score_items.scoring_rule_id and can_manage_competition(sr.competition_id, 'format')
  )
);

drop policy "round_format_blocks writable by organizer" on round_format_blocks;
create policy "round_format_blocks writable by organizer or collaborator" on round_format_blocks for all using (
  exists (
    select 1 from rounds r
    where r.id = round_format_blocks.round_id and can_manage_competition(r.competition_id, 'format')
  )
) with check (
  exists (
    select 1 from rounds r
    where r.id = round_format_blocks.round_id and can_manage_competition(r.competition_id, 'format')
  )
);

-- ============================================================================
-- registrations:/admin/review(身份比對)跟 /judge(淘汰標記)都要讀,
-- 只有 /judge 的淘汰標記需要寫。
-- ============================================================================

drop policy "registrations readable by competition organizer" on registrations;
create policy "registrations readable by organizer or collaborator" on registrations for select using (
  exists (
    select 1 from competitions c
    where c.id = registrations.competition_id
      and (can_manage_competition(c.id, 'review') or can_manage_competition(c.id, 'judge'))
  )
);

drop policy "registrations updatable by competition organizer" on registrations;
create policy "registrations updatable by organizer or collaborator" on registrations for update using (
  exists (
    select 1 from competitions c where c.id = registrations.competition_id and can_manage_competition(c.id, 'judge')
  )
);

-- ============================================================================
-- submissions:讀取給 review + judge,審核動作(status/reviewed_by/review_note)只給 review。
-- ============================================================================

drop policy "submissions readable by competition organizer" on submissions;
create policy "submissions readable by organizer or collaborator" on submissions for select using (
  exists (
    select 1 from rounds r join competitions c on c.id = r.competition_id
    where r.id = submissions.round_id
      and (can_manage_competition(c.id, 'review') or can_manage_competition(c.id, 'judge'))
  )
);

drop policy "submissions updatable by competition organizer" on submissions;
create policy "submissions updatable by organizer or collaborator" on submissions for update using (
  exists (
    select 1 from rounds r join competitions c on c.id = r.competition_id
    where r.id = submissions.round_id and can_manage_competition(c.id, 'review')
  )
);

-- ============================================================================
-- votes / submission_scores:都是 /judge 的範圍。
-- ============================================================================

drop policy "votes readable by competition organizer" on votes;
create policy "votes readable by organizer or collaborator" on votes for select using (
  exists (
    select 1 from rounds r join competitions c on c.id = r.competition_id
    where r.id = votes.round_id and can_manage_competition(c.id, 'judge')
  )
);

drop policy "submission_scores manageable by competition organizer" on submission_scores;
create policy "submission_scores manageable by organizer or collaborator" on submission_scores for all using (
  exists (
    select 1 from submissions s
    join rounds r on r.id = s.round_id
    join competitions c on c.id = r.competition_id
    where s.id = submission_scores.submission_id and can_manage_competition(c.id, 'judge')
  )
) with check (
  exists (
    select 1 from submissions s
    join rounds r on r.id = s.round_id
    join competitions c on c.id = r.competition_id
    where s.id = submission_scores.submission_id and can_manage_competition(c.id, 'judge')
  )
);
